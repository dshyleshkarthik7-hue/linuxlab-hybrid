declare global {
  interface Window {
    netlifyIdentity?: {
      on(event: string, callback: (user?: { email?: string; user_metadata?: { full_name?: string } }) => void): void;
      currentUser(): { email?: string; user_metadata?: { full_name?: string } } | null;
      open(mode?: string): void;
    };
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const identity = window.netlifyIdentity;
  const button = document.querySelector<HTMLButtonElement>('#login');
  const status = document.querySelector<HTMLElement>('#status');
  if (!button || !status) return;
  if (!identity) {
    status.textContent = 'Netlify Identity could not load. Please try again.';
    return;
  }
  identity.on('init', user => {
    if (user) {
      status.textContent = `Signed in as ${user.email || user.user_metadata?.full_name || 'your account'}.`;
      button.textContent = 'Open account';
    } else {
      status.textContent = 'Not signed in.';
    }
  });
  identity.on('login', user => {
    status.textContent = `Signed in as ${user?.email || 'your account'}. Returning to Tutor…`;
    window.setTimeout(() => { window.location.href = '../beginner/#tutor'; }, 300);
  });
  identity.on('logout', () => {
    status.textContent = 'Signed out.';
    button.textContent = 'Sign in / Create account';
  });
  identity.on('error', () => {
    status.textContent = 'Netlify Identity could not complete that action.';
  });
  button.addEventListener('click', () => {
    identity.open(identity.currentUser() ? undefined : 'login');
  });
});
