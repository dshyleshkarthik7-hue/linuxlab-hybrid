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
  rationale?: string;
};

const QUESTIONS: Question[] = [];
const COMMON: Question[] = [
  { id: 'scenario-path', command: 'filesystem', category: 'filesystem', difficulty: 'practical', q: "Which path is relative to the current working directory?", a: "notes.txt", d: ["/etc/notes.txt","/home/ana/notes.txt","../notes.txt"], rationale: "Relative paths are resolved from the current directory; absolute paths begin at /." },
  { id: 'scenario-pipe', command: 'shell', category: 'shell', difficulty: 'practical', q: "What does a | b connect?", a: "a standard output to b standard input", d: ["both stderr streams","b output to a file","two independent shells"], rationale: "A pipe sends the left command's stdout to the right command's stdin." },
  { id: 'scenario-stderr', command: 'redirection', category: 'shell', difficulty: 'practical', q: "Which redirection saves standard error to errors.log?", a: "2> errors.log", d: ["> errors.log","1> errors.log","| errors.log"], rationale: "File descriptor 2 is standard error; 1 is standard output." },
  { id: 'scenario-exit', command: 'shell', category: 'shell', difficulty: 'practical', q: "In Bash, what does $? contain immediately after a command?", a: "the previous command's exit status", d: ["the current PID","the command's output","the number of open files"], rationale: "A zero exit status conventionally means success." },
  { id: 'scenario-find', command: 'find', category: 'filesystem', difficulty: 'practical', q: "Find regular files ending in .log under the current directory.", a: "find . -type f -name \"*.log\"", d: ["grep -R \"*.log\" .","ls -l / \"*.log\"","wc -l .log"], rationale: "Quote the pattern so the shell passes it to find." },
  { id: 'scenario-grep', command: 'grep', category: 'text', difficulty: 'practical', q: "Search for literal a.b where the dot must not be a regex wildcard.", a: "grep -F \"a.b\" file.txt", d: ["grep -E \"a.b\" file.txt","grep -v \"a.b\" file.txt","grep -n \".\" file.txt"], rationale: "grep -F uses fixed-string matching." },
  { id: 'scenario-sshkey', command: 'chmod', category: 'security', difficulty: 'practical', q: "Which mode makes a private key owner-readable/writable only?", a: "600", d: ["644","755","777"], rationale: "Mode 600 grants read/write to owner and no permissions to group or others." },
  { id: 'scenario-df', command: 'df', category: 'storage', difficulty: 'practical', q: "Which command shows available filesystem space for /var?", a: "df -h /var", d: ["du -sh /var","ls -lh /var","wc -c /var"], rationale: "df reports filesystem capacity; du summarizes directory usage." },
  { id: 'scenario-du', command: 'du', category: 'storage', difficulty: 'practical', q: "Summarize a project's disk usage in human-readable form.", a: "du -sh project/", d: ["df -h project/","free -h project/","wc -l project/"], rationale: "du -s summarizes and -h formats sizes for people." },
  { id: 'scenario-terminate', command: 'kill', category: 'processes', difficulty: 'practical', q: "Which signal is usually the first graceful termination request?", a: "SIGTERM", d: ["SIGKILL","SIGSTOP","SIGCONT"], rationale: "SIGTERM can be handled; SIGKILL cannot." },
  { id: 'scenario-tar', command: 'tar', category: 'archives', difficulty: 'practical', q: "List a gzip-compressed tar archive without extracting it.", a: "tar -tzf backup.tar.gz", d: ["tar -xzf backup.tar.gz","tar -czf backup.tar.gz /","gzip -d backup.tar.gz"], rationale: "The t flag lists; z handles gzip and f names the archive." },
  { id: 'scenario-uniq', command: 'sort', category: 'text', difficulty: 'practical', q: "Remove duplicate lines after grouping equal lines together.", a: "sort names.txt | uniq", d: ["uniq names.txt | sort -r","grep -v names.txt","wc -u names.txt"], rationale: "uniq only removes adjacent duplicates, so sorting first groups them." },
  { id: 'scenario-secret', command: 'environment', category: 'security', difficulty: 'practical', q: "How should a script receive a private API token?", a: "from a securely supplied runtime environment variable; never print it", d: ["hard-code and commit it","echo it to logs","put it in a public URL"], rationale: "Avoid committing, printing, or unnecessarily exposing secrets." },
  { id: 'scenario-systemctl', command: 'systemctl', category: 'services', difficulty: 'practical', q: "Inspect whether ssh.service is active without changing it.", a: "systemctl status ssh.service", d: ["systemctl disable ssh.service","systemctl restart ssh.service","rm /etc/systemd/system/ssh.service"], rationale: "status is observational; the other options change system state." },
  { id: 'scenario-journal', command: 'journalctl', category: 'services', difficulty: 'practical', q: "Show journal entries for the nginx systemd unit.", a: "journalctl -u nginx", d: ["chmod -R 777 /var/log","journalctl --vacuum-time=1s","cat /dev/mem"], rationale: "The -u option filters by unit." },
  { id: 'scenario-sockets', command: 'ss', category: 'networking', difficulty: 'practical', q: "Show listening TCP sockets with numeric ports.", a: "ss -lnt", d: ["ip route flush table main","ping -c 100 127.0.0.1","chmod -lnt"], rationale: "ss inspects sockets; -l listening, -n numeric, -t TCP." },
  { id: 'scenario-route', command: 'ip', category: 'networking', difficulty: 'practical', q: "Which command displays the Linux routing table?", a: "ip route", d: ["ip link delete","ip addr flush dev eth0","route rm default"], rationale: "ip route displays routes; flush/delete commands change network state." },
  { id: 'scenario-hostkey', command: 'ssh', category: 'security', difficulty: 'practical', q: "SSH warns that a host key unexpectedly changed. What should you do?", a: "verify the change through a trusted channel before accepting it", d: ["disable host-key checking permanently","send your private key to the admin","ignore the warning"], rationale: "A changed key may be legitimate but can also indicate interception." },
  { id: 'scenario-umask', command: 'umask', category: 'permissions', difficulty: 'practical', q: "What does umask affect?", a: "permission bits on newly created files and directories", d: ["permissions of all existing files","file encryption","file ownership"], rationale: "umask influences creation modes; it does not recursively change existing objects." },
  { id: 'scenario-osrelease', command: 'os', category: 'operating systems', difficulty: 'practical', q: "Which file commonly identifies the Linux distribution and version?", a: "/etc/os-release", d: ["/proc/uptime","/dev/null","/etc/shadow"], rationale: "Distribution identity is distinct from kernel identity." },
  { id: 'scenario-and', command: 'shell', category: 'shell', difficulty: 'practical', q: "What does first && second mean in a shell?", a: "run second only if first succeeds", d: ["run both in parallel","run second only if first fails","pipe first output to second"], rationale: "&& sequences commands conditionally on exit status." },
  { id: 'scenario-append', command: 'redirection', category: 'shell', difficulty: 'practical', q: "Which operator appends stdout instead of replacing the file? ", a: ">>", d: [">","<","2>&0"], rationale: ">> appends; > truncates or creates the target." },
  { id: 'scenario-mktemp', command: 'mktemp', category: 'security', difficulty: 'practical', q: "Create a unique temporary file safely rather than guessing a /tmp filename.", a: "mktemp", d: ["echo secret >/tmp/myfile","chmod 777 /tmp","eval \"$RANDOM\""], rationale: "mktemp reduces predictable-name races; clean up the returned path." },
  { id: 'scenario-tail', command: 'tail', category: 'troubleshooting', difficulty: 'practical', q: "Watch new lines appended to an application log.", a: "tail -f app.log", d: ["head -c 0 app.log","wc -w app.log","sort -f app.log"], rationale: "tail -f follows appended data." },
  { id: 'scenario-xargs', command: 'xargs', category: 'security', difficulty: 'practical', q: "File names may contain spaces or newlines. Which separator is safer with find and xargs?", a: "find . -print0 | xargs -0", d: ["split on spaces","use eval on output","remove all quotes"], rationale: "NUL separators are safe because NUL cannot appear inside a Unix pathname." },
  { id: 'scenario-packages', command: 'packages', category: 'operating systems', difficulty: 'practical', q: "Why do installation instructions differ between Alpine and Debian/Ubuntu?", a: "they use different package tools and ecosystems", d: ["Linux commands never cross distributions","every distro has a different kernel shell","all distros use the same package database"], rationale: "Alpine commonly uses apk; Debian-family systems use apt/dpkg." },
  { id: 'scenario-curl-head', command: 'curl', category: 'networking', difficulty: 'practical', q: "Request HTTP headers without downloading the response body when HEAD is supported.", a: "curl -I https://example.com", d: ["curl -X DELETE https://example.com","curl --upload-file secret.txt https://example.com","curl -k -d token https://example.com"], rationale: "curl -I issues a HEAD request; do not disable TLS checks casually." },
  { id: 'scenario-quote', command: 'shell', category: 'shell', difficulty: 'practical', q: "Why quote \"*.log\" in find -name \"*.log\"?", a: "so the shell passes the wildcard to find", d: ["to make matches executable","to disable Linux regexes","to search only hidden files"], rationale: "Quoting prevents current-directory glob expansion before find sees the pattern." },
  { id: 'scenario-gitstatus', command: 'git', category: 'developer', difficulty: 'practical', q: "Show tracked changes and untracked files in a Git worktree.", a: "git status", d: ["git clean -fd","git reset --hard","git push --force"], rationale: "git status is observational; the alternatives can delete or rewrite work." },
  { id: 'scenario-leastpriv', command: 'sudo', category: 'security', difficulty: 'practical', q: "Before changing protected files, which principle should guide privilege use?", a: "use the narrowest authorized privilege needed", d: ["run everything as root permanently","make files world-writable","disable authentication"], rationale: "Least privilege limits the impact of mistakes and compromise." },

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
  const summaryCounts = new Map<string, number>();
  for (const record of records) {
    const summary = String(record.summary || '').trim().toLowerCase();
    if (summary) summaryCounts.set(summary, (summaryCounts.get(summary) ?? 0) + 1);
  }
  const seenIds = new Set<string>();

  for (const record of records) {
    const name = String(record.name || '').trim();
    const purpose = String(record.summary || '').trim();
    const example = String(record.example || '').trim();
    if (!name || (!purpose && !example)) continue;
    const category = String(record.category || 'linux').trim() || 'linux';
    const categoryNames = unique(namesByCategory.get(category) ?? []);
    const categoryExamples = unique(examplesByCategory.get(category) ?? []);
    const idBase = name + '-' + category;
    const addQuestion = (question: Question): void => {
      if (seenIds.has(question.id)) throw new Error('Quiz catalog contains duplicate question IDs');
      seenIds.add(question.id);
      QUESTIONS.push(question);
    };

    // A description question is answerable only when its authored summary identifies one record.
    if (purpose && summaryCounts.get(purpose.toLowerCase()) === 1) {
      addQuestion({
        id: idBase + '-identify',
        command: name,
        category,
        difficulty: 'foundation',
        q: 'Which command is represented by this catalog entry: ' + purpose + '?',
        a: name,
        d: pickDistractors(categoryNames, name, 3, allNames)
      });
    }

    if (example) {
      addQuestion({
        id: idBase + '-example',
        command: name,
        category,
        difficulty: 'practical',
        q: 'Which example belongs to ' + name + '?',
        a: example,
        d: pickDistractors(categoryExamples, example, 3, allExamples)
      });
      addQuestion({
        id: idBase + '-from-example',
        command: name,
        category,
        difficulty: 'practical',
        q: 'Which command is shown by this example: ' + example + '?',
        a: name,
        d: pickDistractors(categoryNames, name, 3, allNames)
      });
    }
  }
  QUESTIONS.push(...COMMON);

  if (QUESTIONS.length < 300 || new Set(QUESTIONS.map(question => question.id)).size !== QUESTIONS.length) {
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
      f.textContent = (answer === question.a ? '✓ Correct. ' : `Not quite. Correct answer: ${question.a}. `) + (question.rationale || 'Review the command documentation and try a safe example.');
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
