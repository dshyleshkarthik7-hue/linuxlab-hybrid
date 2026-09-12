import { InBrowserLinuxEngine } from './engine/LinuxEngine';
import { COMMAND_LESSONS } from './commands/commandCatalog';

const engine = new InBrowserLinuxEngine();
const output = document.querySelector<HTMLDivElement>('#output')!;
const input = document.querySelector<HTMLInputElement>('#input')!;
const list = document.querySelector<HTMLDivElement>('#commandList')!;
const search = document.querySelector<HTMLInputElement>('#search')!;
const categories = document.querySelector<HTMLDivElement>('#categories')!;
const tutorBody = document.querySelector<HTMLDivElement>('#tutorBody')!;
const tutorInput = document.querySelector<HTMLInputElement>('#tutorInput')!;
const count = document.querySelector<HTMLElement>('#count')!;
let active = 'All';
let history: string[] = [];
let tutorRequests = 0;
let tutorWindow = Date.now();

const write = (text: string, cls = '') => {
  const d = document.createElement('div');
  d.className = `line ${cls}`;
  d.textContent = text;
  output.appendChild(d);
  output.scrollTop = output.scrollHeight;
};

const prompt = () => {
  const p = document.querySelector('.input-row span');
  if (p) p.textContent = `learner@linuxterminal:${engine.getCwd() === '/root' ? '~' : engine.getCwd()}$`;
};

async function run(value: string) {
  const command = value.trim();
  if (!command) return;
  write(`${promptText()} ${command}`, 'cmd');
  input.value = '';
  const result = await engine.execute(command);
  if (result) write(result);
  history.push(command);
  if (history.length > 20) history.shift();
  prompt();
}

function promptText() {
  const cwd = engine.getCwd() === '/root' ? '~' : engine.getCwd();
  return `learner@linuxterminal:${cwd}$`;
}

const cats = ['All', ...Array.from(new Set(COMMAND_LESSONS.map(c => c.category)))];
for (const category of cats) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = category;
  if (category === 'All') button.classList.add('active');
  button.addEventListener('click', () => {
    active = category;
    document.querySelectorAll('#categories button').forEach(x => x.classList.remove('active'));
    button.classList.add('active');
    render();
  });
  categories.appendChild(button);
}

function render() {
  const query = search.value.trim().toLowerCase();
  list.replaceChildren();
  const lessons = COMMAND_LESSONS.filter(lesson =>
    (active === 'All' || lesson.category === active) &&
    (!query || lesson.name.includes(query) || lesson.summary.toLowerCase().includes(query))
  );
  lessons.forEach(lesson => {
    const row = document.createElement('div');
    row.className = 'command';
    const info = document.createElement('div');
    const code = document.createElement('code');
    code.textContent = lesson.name;
    const desc = document.createElement('small');
    desc.textContent = lesson.summary;
    info.append(code, desc);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'try';
    button.textContent = 'TRY';
    button.addEventListener('click', () => {
      input.value = lesson.example;
      input.focus();
    });
    row.append(info, button);
    row.addEventListener('click', event => {
      if (event.target !== button) {
        input.value = lesson.example;
        input.focus();
      }
    });
    list.appendChild(row);
  });
  count.textContent = `${lessons.length}/${COMMAND_LESSONS.length}`;
}

async function askTutor(question: string) {
  const q = question.trim();
  if (!q) return;
  const now = Date.now();
  if (now - tutorWindow >= 60_000) {
    tutorWindow = now;
    tutorRequests = 0;
  }
  if (tutorRequests >= 6) {
    tutorBody.textContent = 'Tutor limit reached for this minute. Keep practicing and try again shortly.';
    return;
  }
  tutorRequests++;
  tutorBody.textContent = 'Thinking…';
  const context = `Level: beginner\nCurrent directory: ${engine.getCwd()}\nRecent commands: ${history.slice(-8).join(' | ') || 'none'}\nLast command: ${history.at(-1) || 'none'}\nEnvironment: browser-safe Linux simulator`;
  try {
    const response = await fetch('/api/tutor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: q.slice(0, 1200), context }),
    });
    const data = await response.json() as { answer?: string; error?: string };
    if (!response.ok) throw new Error(data.error || 'Tutor unavailable');
    tutorBody.textContent = data.answer || 'No answer returned.';
  } catch (error) {
    tutorBody.textContent = error instanceof Error ? error.message : 'Tutor unavailable.';
  }
}

search.addEventListener('input', render);
document.querySelector<HTMLFormElement>('#commandForm')!.addEventListener('submit', event => {
  event.preventDefault();
  void run(input.value);
});
document.querySelector('#reset')!.addEventListener('click', () => location.reload());
document.querySelectorAll<HTMLButtonElement>('.suggestions button').forEach(button => {
  button.addEventListener('click', () => void askTutor(button.dataset.q || ''));
});
document.querySelector<HTMLFormElement>('#tutorForm')!.addEventListener('submit', event => {
  event.preventDefault();
  void askTutor(tutorInput.value);
  tutorInput.value = '';
});
document.querySelector('#tutorToggle')?.addEventListener('click', () => document.querySelector('#tutor')?.scrollIntoView({ behavior: 'smooth' }));

const keyboard = document.querySelector<HTMLDivElement>('#keyboard')!;
for (const [label, value] of [['ESC', '\u001b'], ['TAB', '\t'], ['CTRL+C', '\u0003'], ['CTRL+D', '\u0004'], ['|', '|'], ['/', '/'], ['~', '~'], ['ENTER', '\n']] as const) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', () => {
    if (value === '\n') void run(input.value);
    else input.setRangeText(value, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, 'end');
    input.focus();
  });
  keyboard.appendChild(button);
}

write('Welcome to LinuxTerminal.me — learn Linux by doing.');
write('Start with `pwd`, `ls -la`, `mkdir practice`, or `cat /etc/os-release`.');
write('Choose a lesson on the left, predict the result, run it, then ask the Tutor to explain it.');
render();
