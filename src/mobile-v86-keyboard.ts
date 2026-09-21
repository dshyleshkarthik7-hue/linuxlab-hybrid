type Shortcut = 'ctrl-o' | 'ctrl-x' | 'ctrl-w' | 'ctrl-k' | 'ctrl-c' | 'ctrl-d' | 'ctrl-l' | 'ctrl-u' | 'ctrl-a' | 'ctrl-e' | 'esc' | 'tab' | 'enter' | 'backspace';

declare global {
  interface Window {
    linuxLabVM?: import('./main-v86.ts').V86LinuxTerminal;
  }
}

const SHORTCUTS: Record<Shortcut, string> = {
  'ctrl-o': '\u000f',
  'ctrl-x': '\u0018',
  'ctrl-w': '\u0017',
  'ctrl-k': '\u000b',
  'ctrl-c': '\u0003',
  'ctrl-d': '\u0004',
  'ctrl-l': '\u000c',
  'ctrl-u': '\u0015',
  'ctrl-a': '\u0001',
  'ctrl-e': '\u0005',
  esc: '\u001b',
  tab: '\t',
  enter: '\r',
  backspace: '\u007f',
};

function send(data: string): void {
  window.linuxLabVM?.sendMobileInput(data);
}

function bind(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-v86-key]').forEach((button) => {
    const shortcut = button.dataset.v86Key as Shortcut | undefined;
    if (!shortcut || !(shortcut in SHORTCUTS)) return;
    button.addEventListener('click', () => send(SHORTCUTS[shortcut]));
  });
}

window.addEventListener('DOMContentLoaded', bind, { once: true });
export {};
