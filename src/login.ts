export {};

type IdentityUser = {
  email?: string;
  user_metadata?: { full_name?: string };
};

type NetlifyIdentity = {
  on(event: string, callback: (user?: IdentityUser) => void): void;
  currentUser(): IdentityUser | null;
  open(mode?: string): void;
};

type IdentityWindow = Window & { netlifyIdentity?: NetlifyIdentity };

window.addEventListener('DOMContentLoaded', () => {
  const identity = (window as IdentityWindow).netlifyIdentity;
  const button = document.querySelector<HTMLButtonElement>('#login');
  const status = document.querySelector<HTMLElement>('#status');
  if (!button || !status) return;
  if (!identity) {
    status.textContent = 'Netlify Identity could not load. Please try again.';
    return;
  }

  const updateSignedInState = (user?: IdentityUser | null) => {
    if (user) {
      const name = user.user_metadata?.full_name || user.email || 'your account';
      status.textContent = `Signed in as ${name}.`;
      button.textContent = 'Open account';
      button.setAttribute('aria-label', 'Open your Netlify Identity account');
    } else {
      status.textContent = 'Sign in to unlock the AI Tutor.';
      button.textContent = 'Sign in / Create account';
      button.setAttribute('aria-label', 'Sign in or create a LinuxTerminal account');
    }
  };

  identity.on('init', (user?: IdentityUser) => updateSignedInState(user));
  identity.on('login', (user?: IdentityUser) => {
    status.textContent = `Signed in as ${user?.email || 'your account'}. Returning to Tutor…`;
    window.setTimeout(() => { window.location.href = '../beginner/#tutor'; }, 300);
  });
  identity.on('logout', () => updateSignedInState(null));
  identity.on('error', () => {
    status.textContent = 'Netlify Identity could not complete that action. Please try again.';
  });
  button.addEventListener('click', () => {
    identity.open(identity.currentUser() ? undefined : 'login');
  });
});
