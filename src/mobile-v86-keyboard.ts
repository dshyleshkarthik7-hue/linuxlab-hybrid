type Shortcut = 'ctrl-o' | 'ctrl-x' | 'ctrl-w' | 'ctrl-k' | 'ctrl-c' | 'ctrl-d' | 'ctrl-l' | 'ctrl-u' | 'ctrl-a' | 'ctrl-e' | 'ctrl-shift-v' | 'esc' | 'tab' | 'enter' | 'backspace';

declare global {
  interface Window {
    linuxLabVM?: import('./main-v86.ts').V86LinuxTerminal;
  }
}

const SHORTCUTS: Partial<Record<Shortcut, string>> = {
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
    if (!shortcut) return;
    if (shortcut === 'ctrl-shift-v') {
      button.addEventListener('click', () => {
        void navigator.clipboard.readText().then((text) => {
          if (text) send(text);
        }).catch(() => {
          /* clipboard permission denied or unavailable */
        });
      });
      return;
    }
    if (!(shortcut in SHORTCUTS)) return;
    button.addEventListener('click', () => { const payload = SHORTCUTS[shortcut]; if (payload) send(payload); });
  });
}

window.addEventListener('DOMContentLoaded', bind, { once: true });
export {};
