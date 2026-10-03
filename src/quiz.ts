type CommandRecord = {
  name: string;
  summary?: string;
  example?: string;
  category?: string;
};

type Question = {
  id: string;
  command: string;
  category: string;
  difficulty: 'foundation' | 'practical' | 'reasoning';
  q: string;
  a: string;
  d: string[];
};

const QUESTIONS: Question[] = [];
const COMMON: Question[] = [
  { id: 'os-kernel', command: 'operating-systems', category: 'os', difficulty: 'reasoning', q: 'Which component manages core Linux resources such as processes and memory?', a: 'the Linux kernel', d: ['the shell prompt', 'the terminal emulator', 'the browser cache'] },
  { id: 'os-process', command: 'operating-systems', category: 'os', difficulty: 'reasoning', q: 'What is a process?', a: 'a running instance of a program', d: ['a filesystem path', 'a DNS record', 'a terminal color'] },
  { id: 'net-dns', command: 'networking', category: 'networking', difficulty: 'reasoning', q: 'Which system maps hostnames to IP addresses?', a: 'DNS', d: ['SSH', 'DHCP only', 'ARP only'] },
  { id: 'net-route', command: 'networking', category: 'networking', difficulty: 'reasoning', q: 'What does a routing table describe?', a: 'where packets should be sent next', d: ['file permissions', 'process environment variables', 'archive compression'] },
  { id: 'net-port', command: 'networking', category: 'networking', difficulty: 'reasoning', q: 'What does a TCP/UDP port identify?', a: 'a transport-layer endpoint associated with a service', d: ['a filesystem inode', 'a CPU core', 'a shell alias'] }
];

function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const j = random[0] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function randomDistinctIndices(length: number, excluded: number, count: number): number[] {
  const selected: number[] = [];
  while (selected.length < count) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const candidate = random[0] % length;
    if (candidate === excluded || selected.includes(candidate)) continue;
    selected.push(candidate);
  }
  return selected;
}

async function load(): Promise<void> {
  const response = await fetch('/command-records.json', { cache: 'force-cache' });
  if (!response.ok) throw new Error('Command catalog unavailable');

  const payload = await response.json() as { records?: CommandRecord[] };
  const records = Array.isArray(payload.records) ? payload.records : [];
  if (records.length < 6000) throw new Error('Quiz catalog is incomplete');

  const namesByCategory = new Map<string, string[]>();
  const examplesByCategory = new Map<string, string[]>();
  for (const record of records) {
    const name = String(record.name).trim();
    const category = String(record.category || 'linux').trim() || 'linux';
    if (!name) continue;
    const names = namesByCategory.get(category) ?? [];
    names.push(name);
    namesByCategory.set(category, names);
    const example = String(record.example || '').trim();
    if (example) {
      const examples = examplesByCategory.get(category) ?? [];
      examples.push(example);
      examplesByCategory.set(category, examples);
    }
  }

  const unique = (values: string[]) => [...new Set(values)];
  const pickDistractors = (pool: string[], answer: string, count: number, fallback: string[]): string[] => {
    const candidates = unique([...pool, ...fallback]).filter(value => value && value !== answer);
    if (candidates.length < count) throw new Error('Quiz catalog does not contain enough unique distractors');
    const picked: string[] = [];
    const indices = randomDistinctIndices(candidates.length, -1, Math.min(count, candidates.length));
    for (const i of indices) {
      const value = candidates[i];
      if (!picked.includes(value)) picked.push(value);
      if (picked.length === count) break;
    }
    if (picked.length !== count) throw new Error('Quiz distractor generation failed');
    return picked;
  };

  const allNames = unique(records.map(record => String(record.name).trim()).filter(Boolean));
  const allExamples = unique(records.map(record => String(record.example || '').trim()).filter(Boolean));
  const seenIds = new Set<string>();

  for (const record of records) {
    const name = String(record.name).trim();
    const purpose = String(record.summary || 'Linux command').trim() || 'Linux command';
    const example = String(record.example || '').trim() || name + ' --help';
    const category = String(record.category || 'linux').trim() || 'linux';
    const categoryNames = namesByCategory.get(category) ?? [];
    const categoryExamples = examplesByCategory.get(category) ?? [];
    const idBase = name + '-' + category;
    const identifyId = idBase + '-identify';
    const exampleId = idBase + '-example';
    if (seenIds.has(identifyId) || seenIds.has(exampleId)) throw new Error('Quiz catalog contains duplicate question IDs');
    seenIds.add(identifyId);
    seenIds.add(exampleId);

    QUESTIONS.push({
      id: identifyId,
      command: name,
      category,
      difficulty: 'foundation',
      q: 'Which command is represented by this catalog entry: ' + purpose + '?',
      a: name,
      d: pickDistractors(categoryNames, name, 3, allNames)
    });

    QUESTIONS.push({
      id: exampleId,
      command: name,
      category,
      difficulty: 'practical',
      q: 'Which example belongs to ' + name + '?',
      a: example,
      d: pickDistractors(categoryExamples, example, 3, allExamples)
    });
  }

  QUESTIONS.push(...COMMON);

  if (QUESTIONS.length < 12000 || new Set(QUESTIONS.map(question => question.id)).size !== QUESTIONS.length) {
    throw new Error('Quiz bank was not generated uniquely from the full catalog');
  }
}

let session: Question[] = [];
let index = 0;
let score = 0;
let answered = false;
const SESSION_SIZE = 500;

const q = document.querySelector<HTMLElement>('#question');
const o = document.querySelector<HTMLElement>('#options');
const f = document.querySelector<HTMLElement>('#feedback');
const n = document.querySelector<HTMLButtonElement>('#next');
const p = document.querySelector<HTMLElement>('#progress');
const s = document.querySelector<HTMLElement>('#score');
const c = document.querySelector<HTMLElement>('#context');
const r = document.querySelector<HTMLElement>('#result');

function render(): void {
  answered = false;
  const question = session[index];
  if (!question || !q || !o || !f || !n || !p || !s || !c) return;

  p.textContent = `Question ${index + 1} / ${session.length}`;
  s.textContent = `Score: ${score}`;
  q.textContent = question.q;
  c.textContent = `${question.command} • ${question.category} • ${question.difficulty}`;
  f.textContent = '';
  n.hidden = true;
  o.replaceChildren();

  for (const answer of shuffle([question.a, ...question.d])) {
    const button = document.createElement('button');
    button.className = 'option';
    button.type = 'button';
    button.textContent = answer;
    button.onclick = () => {
      if (answered) return;
      answered = true;
      for (const other of o.querySelectorAll('button')) other.disabled = true;
      if (answer === question.a) {
        button.classList.add('correct');
        score++;
      } else {
        button.classList.add('wrong');
      }
      s.textContent = `Score: ${score}`;
      f.textContent = answer === question.a ? '✓ Correct.' : `Not quite. Correct answer: ${question.a}`;
      n.hidden = false;
    };
    o.appendChild(button);
  }
}

function finish(): void {
  const pct = session.length ? (score / session.length * 100).toFixed(0) : '0';
  if (q) q.textContent = 'Practice assessment complete';
  if (c) c.textContent = '';
  if (o) o.replaceChildren();
  if (f) f.textContent = '';
  if (r) r.textContent = `Exact score: ${score} / ${session.length} • ${pct}% • The question bank covers the full canonical command catalog plus OS and networking.`;
  if (n) n.hidden = true;
}

n?.addEventListener('click', () => {
  if (index < session.length - 1) {
    index++;
    render();
  } else {
    finish();
  }
});

document.querySelector<HTMLButtonElement>('#reset')?.addEventListener('click', () => {
  session = shuffle(QUESTIONS).slice(0, SESSION_SIZE);
  index = 0;
  score = 0;
  render();
});

load()
  .then(() => {
    session = shuffle(QUESTIONS).slice(0, SESSION_SIZE);
    render();
  })
  .catch(error => {
    if (q) q.textContent = error instanceof Error ? error.message : 'Quiz unavailable';
  });
