import { InBrowserLinuxEngine } from './engine/LinuxEngine';

const engine = new InBrowserLinuxEngine();
const output = document.querySelector<HTMLDivElement>('#output');
const input = document.querySelector<HTMLInputElement>('#input');
const form = document.querySelector<HTMLFormElement>('#commandForm');

function write(text: string, cls = '') {
  if (!output) return;
  const line = document.createElement('div');
  line.className = cls;
  line.textContent = text;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

async function run(value: string) {
  const command = value.trim();
  if (!command) return;
  write(`learner@linuxterminal:~$ ${command}`, 'cmd');
  if (input) input.value = '';
  try {
    const result = await engine.execute(command);
    if (result) write(result);
  } catch (error) {
    write(error instanceof Error ? error.message : 'Command failed.', 'err');
  }
}

form?.addEventListener('submit', event => {
  event.preventDefault();
  void run(input?.value || '');
});

document.querySelector('#reset')?.addEventListener('click', () => location.reload());

document.querySelectorAll<HTMLButtonElement>('[data-command]').forEach(button => {
  button.addEventListener('click', () => {
    const command = button.dataset.command || '';
    if (input) {
      input.value = command;
      input.focus();
    }
    void run(command);
  });
});

write('⚡  Welcome to the LinuxTerminal Learning Sandbox.');
write('This workspace is simulated for learning. Use Real Linux above when you want an actual Linux environment.');
write('Try "help", "ls -la", "cd /tmp", "mkdir practice", or "pwd".');
