import { InBrowserLinuxEngine } from './engine/LinuxEngine';

const engine = new InBrowserLinuxEngine();
const output = document.querySelector<HTMLDivElement>('#output');
const input = document.querySelector<HTMLInputElement>('#input');
const form = document.querySelector<HTMLFormElement>('#commandForm');
const tutorQuestion = document.querySelector<HTMLTextAreaElement>('#tutor-question');
const tutorAsk = document.querySelector<HTMLButtonElement>('#tutor-ask');
const tutorOutput = document.querySelector<HTMLDivElement>('#tutor-output');
const tutorStatus = document.querySelector<HTMLSpanElement>('#tutor-status');
const tutorHistory: string[] = [];

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

async function askTutor() {
  const question = tutorQuestion?.value.trim() || '';
  if (!question || !tutorOutput || !tutorAsk) return;
  tutorAsk.disabled = true;
  if (tutorStatus) tutorStatus.textContent = 'Thinking…';
  tutorOutput.textContent = 'The LinuxTerminal Tutor is reading your learning context…';

  const recentOutput = output?.innerText.slice(-4500) || '';
  const context = [
    'Product: LinuxTerminal.me',
    'Mode: browser learning simulator (not a real Linux kernel)',
    `Current command input: ${input?.value || '(empty)'}`,
    `Recent terminal output:\n${recentOutput || '(none)'}`,
    `Recent Tutor questions:\n${tutorHistory.slice(-3).join('\n') || '(none)'}`,
  ].join('\n\n');

  try {
    const response = await fetch('/api/tutor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, context }),
    });
    const data: unknown = await response.json();
    if (!response.ok || !data || typeof data !== 'object' || !('answer' in data)) {
      throw new Error('Tutor request failed.');
    }
    const answer = String((data as { answer: unknown }).answer || 'No Tutor response was returned.');
    tutorOutput.textContent = answer;
    tutorHistory.push(`Q: ${question}\nA: ${answer}`);
    if (tutorStatus) tutorStatus.textContent = 'Ready';
  } catch (error) {
    tutorOutput.textContent = error instanceof Error ? error.message : 'Tutor is temporarily unavailable. Try the built-in command hints below.';
    if (tutorStatus) tutorStatus.textContent = 'Fallback available';
  } finally {
    tutorAsk.disabled = false;
  }
}

form?.addEventListener('submit', event => {
  event.preventDefault();
  void run(input?.value || '');
});

tutorAsk?.addEventListener('click', () => { void askTutor(); });
tutorQuestion?.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    void askTutor();
  }
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

write('⚡  Welcome to LinuxTerminal.me — the LinuxTerminal Learning Sandbox.');
write('This workspace is simulated for learning. Use Real Linux above when you want genuine kernel behavior.');
write('Try "help", "ls -la", "cd /tmp", "mkdir practice", or "pwd". Ask the AI Tutor whenever you get stuck.');
