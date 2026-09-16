const commands = ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'cp', 'mv', 'rm', 'find', 'echo', 'printf', 'grep', 'head', 'tail', 'wc', 'sort', 'uniq', 'sed', 'awk', 'chmod', 'whoami', 'ps', 'top', 'df', 'du', 'free', 'uname', 'date', 'env', 'export', 'history', 'clear', 'man', 'tar', 'gzip', 'zip', 'ping', 'curl', 'ip', 'ifconfig', 'ssh', 'scp', 'gcc', 'make', 'nano', 'vim', 'vi', 'less', 'cut'];
const qs = commands.flatMap((name, i) => Array.from({ length: 10 }, (_, j) => ({
  name,
  n: i + j + 1,
  q: `Question ${i * 10 + j + 1}: which Linux command is the dedicated lesson for <code>${name}</code>?`,
  opts: [name, commands[(i + 7) % 50], commands[(i + 17) % 50], commands[(i + 29) % 50]],
})));

let pos = 0;
let score = 0;
let locked = false;
const q = document.querySelector('#q');
const opts = document.querySelector('#options');
const fb = document.querySelector('#feedback');
const next = document.querySelector('#next');

function renderQuestionText(text) {
  const [before, codeText, after = ''] = text.split(/<code>|<\/code>/);
  q.replaceChildren(document.createTextNode(before));
  if (codeText !== undefined) {
    const code = document.createElement('code');
    code.textContent = codeText;
    q.append(code, document.createTextNode(after));
  }
}

function render() {
  const x = qs[pos];
  locked = false;
  renderQuestionText(x.q);
  opts.replaceChildren();
  [...x.opts].sort(() => Math.random() - 0.5).forEach((value) => {
    const button = document.createElement('button');
    button.textContent = value;
    button.onclick = () => {
      if (locked) return;
      locked = true;
      if (value === x.name) {
        score++;
        fb.textContent = '✓ Correct.';
      } else {
        fb.textContent = `Not quite. Best answer: ${x.name}.`;
      }
      next.hidden = false;
    };
    opts.appendChild(button);
  });
  document.querySelector('#counter').textContent = `Question ${pos + 1} / 500`;
  document.querySelector('#score').textContent = `Score ${score}`;
  document.querySelector('#progress').style.width = `${pos / 5}%`;
  fb.textContent = '';
  next.hidden = true;
}

next.onclick = () => {
  if (pos < 499) {
    pos++;
    render();
  } else {
    q.textContent = 'Quiz complete';
    opts.replaceChildren();
    fb.textContent = `Final score: ${score} / 500`;
    next.hidden = true;
    document.querySelector('#progress').style.width = '100%';
  }
};

render();
