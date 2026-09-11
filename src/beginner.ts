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
let activeCategory = 'All';
let commandCount = 0;
const startedAt = Date.now();

const write = (text: string, cls = '') => {
  const div = document.createElement('div');
  div.className = `line ${cls}`;
  div.textContent = text;
  output.appendChild(div);
  output.scrollTop = output.scrollHeight;
};

const refreshPrompt = () => {
  const prompt = document.querySelector('.input-row span');
  if (prompt) prompt.textContent = `root@linuxterminal:${engine.getCwd() === '/root' ? '~' : engine.getCwd()}#`;
};

const updateSessionStats = () => {
  const elapsed = Math.max(1, Math.floor((Date.now() - startedAt) / 60000));
  const created = document.querySelector('#created');
  const pid = document.querySelector('#pid');
  const ram = document.querySelector('#ram');
  const cpu = document.querySelector('#cpu');
  const syscalls = document.querySelector('#syscalls');
  if (created) created.textContent = String(commandCount);
  if (pid) pid.textContent = '1';
  if (ram) ram.textContent = `${Math.max(1, Math.round(commandCount * 0.25))} MB virtual`; 
  if (cpu) cpu.textContent = 'N/A';
  if (syscalls) syscalls.textContent = 'N/A';
  const status = document.querySelector('#status');
  if (status) status.textContent = `Engine A • simulated • ${elapsed}m session`;
};

const run = async (value: string) => {
  const command = value.trim();
  if (!command) return;
  write(`root@linuxterminal:~# ${command}`, 'cmd');
  input.value = '';
  const result = await engine.execute(command);
  if (result) write(result);
  refreshPrompt();
  commandCount += 1;
  updateSessionStats();
};

const categoriesSet = ['All', ...Array.from(new Set(COMMAND_LESSONS.map(c => c.category)))];
for (const category of categoriesSet) {
  const button = document.createElement('button');
  button.textContent = category;
  if (category === 'All') button.classList.add('active');
  button.onclick = () => {
    activeCategory = category;
    document.querySelectorAll('.chips button').forEach(b => b.classList.remove('active'));
    button.classList.add('active');
    render();
  };
  categories.appendChild(button);
}

function render() {
  const q = search.value.trim().toLowerCase();
  const items = COMMAND_LESSONS.filter(c =>
    (activeCategory === 'All' || c.category === activeCategory) &&
    (!q || c.name.includes(q) || c.summary.toLowerCase().includes(q))
  );
  list.replaceChildren();
  for (const lesson of items) {
    const row = document.createElement('div');
    row.className = 'command';
    const info = document.createElement('div');
    const code = document.createElement('code');
    code.textContent = lesson.name;
    const desc = document.createElement('small');
    desc.textContent = lesson.summary;
    info.append(code, desc);
    const btn = document.createElement('button');
    btn.className = 'try';
    btn.textContent = 'TRY';
    btn.onclick = () => { input.value = lesson.example; input.focus(); };
    row.append(info, btn);
    row.onclick = e => { if (e.target !== btn) { input.value = lesson.example; input.focus(); } };
    list.appendChild(row);
  }
  document.querySelector('#count')!.textContent = String(COMMAND_LESSONS.length);
}

search.addEventListener('input', render);
document.querySelector<HTMLFormElement>('#commandForm')!.addEventListener('submit', e => {
  e.preventDefault();
  void run(input.value);
});
document.querySelector('#reset')!.addEventListener('click', () => location.reload());
document.querySelectorAll<HTMLButtonElement>('.suggestions button').forEach(btn => btn.onclick = () => askTutor(btn.dataset.q || ''));
document.querySelector<HTMLFormElement>('#tutorForm')!.addEventListener('submit', e => {
  e.preventDefault();
  askTutor(tutorInput.value);
  tutorInput.value = '';
});
document.querySelector('#tutorToggle')!.addEventListener('click', () => document.querySelector('#tutor')?.scrollIntoView({ behavior: 'smooth' }));

function askTutor(question: string) {
  const q = question.toLowerCase();
  let answer = 'Try the command, then ask me what happened. I can explain the sandbox result and suggest the next concept.';
  if (q.includes('last') || q.includes('command')) answer = 'Start by reading the command output carefully. This terminal is a safe simulation and cannot execute programs on your real computer.';
  else if (q.includes('hint')) answer = 'Use the command explorer to find a lesson, run its example, change one argument, and observe the result. For filesystem practice, start with `pwd`, `ls`, `mkdir`, `touch`, then `cat`.';
  else if (q.includes('next')) answer = 'A good path is: pwd → ls → cd → mkdir → touch → cat → cp → mv → grep → pipes → permissions → processes. You can practice every catalog lesson without locking.';
  else if (q.includes('chmod')) answer = '`chmod` changes permission bits. A value such as 755 represents owner, group, and other permissions. Try `chmod 644 notes.txt`, then inspect it with `ls -l`.';
  tutorBody.textContent = answer;
}

const keys = [
  ['ESC', '\u001b'], ['TAB', '\t'], ['CTRL+C', '\u0003'], ['CTRL+D', '\u0004'], ['CTRL+L', '\u000c'],
  ['←', '←'], ['↑', '↑'], ['↓', '↓'], ['→', '→'], ['|', '|'], ['/','/'], ['~','~'], ['-','-'], ['ENTER','\n']
] as const;
const keyboard = document.querySelector<HTMLDivElement>('#keyboard')!;
for (const [label, value] of keys) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.onclick = () => {
    if (value === '\n') void run(input.value);
    else input.setRangeText(value, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, 'end');
    input.focus();
  };
  keyboard.appendChild(b);
}

write('Welcome to LinuxTerminal.me Beginner Sandbox. All 200 catalog lessons are available; execution support is determined by the simulator engine.');
write('This is Engine A: a browser simulation, not a real kernel. Real CPU/RAM/syscall telemetry is only shown in the Real Alpine environment when the guest can provide it.');
write('Try `pwd`, `ls -la`, `mkdir practice && touch practice/hello.txt`, or `cat /etc/os-release`.');
render();
updateSessionStats();
