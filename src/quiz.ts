const commands = ['pwd','ls','cd','mkdir','touch','cat','cp','mv','rm','find','echo','printf','grep','head','tail','wc','sort','uniq','sed','awk','chmod','whoami','ps','top','df','du','free','uname','date','env','export','history','clear','man','tar','gzip','zip','ping','curl','ip','ifconfig','ssh','scp','gcc','make','nano','vim','vi','less','cut'] as const;

type Question = { q: string; a: string; d?: string[]; command: string };
const questions: Question[] = [];
const forms: Array<(command: string, index: number) => Omit<Question, 'command'>> = [
  (c) => ({ q: `What is a primary learning goal for \`${c}\`?`, a: 'understand its syntax, output and exit status' }),
  (c, i) => ({ q: 'Which command should you practice for this question?', a: c, d: [commands[(i + 1) % commands.length], commands[(i + 7) % commands.length], commands[(i + 13) % commands.length]] }),
  (c) => ({ q: `What should you inspect after running \`${c}\`?`, a: 'stdout, stderr and the exit status' }),
  (c) => ({ q: `Where should a beginner safely practice \`${c}\` in LinuxTerminal?`, a: 'the browser simulator' }),
  (c) => ({ q: `Which option is a good learning method for \`${c}\`?`, a: 'predict, run, inspect, then explain the result' }),
  (c) => ({ q: `What can a non-zero exit status from \`${c}\` indicate?`, a: 'the command reported a failure' }),
  (c) => ({ q: `Which workflow is best when learning \`${c}\`?`, a: 'start with a small example and change one input at a time' }),
  (c) => ({ q: `What should the AI Tutor use to explain a \`${c}\` mistake?`, a: 'the command, output, error, history and current context' }),
  (c) => ({ q: `What should you avoid assuming about simulator results for \`${c}\`?`, a: 'that simulated kernel or network behavior is identical to a host Linux system' }),
  (c) => ({ q: `After mastering \`${c}\`, what is a useful next step?`, a: 'combine it with another command and verify the pipeline or conditional' }),
];

for (let i = 0; i < commands.length; i += 1) {
  for (const make of forms) questions.push({ ...make(commands[i], i), command: commands[i] });
}

let index = 0;
let score = 0;
let answered = false;

const qEl = document.querySelector<HTMLElement>('#question');
const oEl = document.querySelector<HTMLElement>('#options');
const fEl = document.querySelector<HTMLElement>('#feedback');
const nEl = document.querySelector<HTMLButtonElement>('#next');
const pEl = document.querySelector<HTMLElement>('#progress');
const sEl = document.querySelector<HTMLElement>('#score');
const cEl = document.querySelector<HTMLElement>('#context');
const rEl = document.querySelector<HTMLElement>('#result');

if (questions.length !== 500) throw new Error(`Quiz configuration must contain exactly 500 questions; found ${questions.length}`);

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function render(): void {
  answered = false;
  const question = questions[index];
  if (!qEl || !oEl || !fEl || !nEl || !pEl || !sEl || !cEl) return;

  pEl.textContent = `Question ${index + 1} / ${questions.length}`;
  sEl.textContent = `Score: ${score}`;
  qEl.textContent = question.q;
  cEl.textContent = `Focus command: ${question.command}`;
  fEl.textContent = '';
  if (rEl) rEl.textContent = '';
  nEl.hidden = true;
  oEl.replaceChildren();

  const defaultDistractors = [
    'stdout, stderr and the exit status',
    'the browser simulator',
    'predict, run, inspect, then explain the result',
    'the command reported a failure',
    'start with a small example and change one input at a time',
    'the command, output, error, history and current context',
    'that simulated kernel or network behavior is identical to a host Linux system',
    'combine it with another command and verify the pipeline or conditional',
  ];
  const pool = question.d ?? defaultDistractors;
  const options = shuffle([question.a, ...shuffle(pool.filter((value) => value !== question.a)).slice(0, 3)]);

  for (const option of options) {
    const button = document.createElement('button');
    button.className = 'option';
    button.type = 'button';
    button.textContent = option;
    button.addEventListener('click', () => answer(button, option, question.a));
    oEl.appendChild(button);
  }
}

function answer(button: HTMLButtonElement, option: string, correct: string): void {
  if (answered || !oEl || !fEl || !nEl || !sEl) return;
  answered = true;
  for (const child of oEl.querySelectorAll<HTMLButtonElement>('button')) child.disabled = true;
  if (option === correct) {
    button.classList.add('correct');
    score += 1;
    fEl.textContent = '✓ Correct.';
  } else {
    button.classList.add('wrong');
    fEl.textContent = `Not quite. Correct answer: ${correct}`;
  }
  sEl.textContent = `Score: ${score}`;
  nEl.hidden = false;
}

function finish(): void {
  const percentage = Math.round((score / questions.length) * 10000) / 100;
  const passed = score >= 400;
  if (qEl) qEl.textContent = 'Assessment complete';
  if (cEl) cEl.textContent = '';
  if (oEl) oEl.replaceChildren();
  if (fEl) fEl.textContent = '';
  if (rEl) rEl.textContent = `Final score: ${score} / ${questions.length} • ${percentage.toFixed(2)}% • ${passed ? 'Learning pass mark reached' : 'Below the 80% learning pass mark'}.`;
  if (nEl) nEl.hidden = true;
}

nEl?.addEventListener('click', () => {
  if (index < questions.length - 1) {
    index += 1;
    render();
    return;
  }
  finish();
});

document.querySelector<HTMLButtonElement>('#reset')?.addEventListener('click', () => {
  index = 0;
  score = 0;
  render();
});

render();
