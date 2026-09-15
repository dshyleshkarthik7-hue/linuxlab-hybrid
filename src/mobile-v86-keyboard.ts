type Shortcut = 'ctrl-o' | 'ctrl-x' | 'ctrl-w' | 'ctrl-k' | 'esc' | 'tab' | 'enter' | 'backspace';

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
