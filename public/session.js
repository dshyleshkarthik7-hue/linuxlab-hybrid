(() => {
  const FORM_SELECTOR = 'form[name="session-complete"]';
  const show = () => {
    if (document.getElementById('session-complete-dialog')) return;
    const blueprint = document.querySelector(FORM_SELECTOR);
    if (!blueprint) return;
    const dialog = document.createElement('section');
    dialog.id = 'session-complete-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-labelledby', 'session-complete-title');
    dialog.style.cssText = 'position:fixed;inset:auto 18px 18px auto;z-index:9999;max-width:420px;padding:20px;background:#0d2038;color:#e8f1ff;border:1px solid #315b87;border-radius:16px;box-shadow:0 20px 60px #0008;font:15px/1.5 system-ui,sans-serif';
    dialog.innerHTML = '<h2 id="session-complete-title" style="margin-top:0">Save your session</h2><p>Optional: leave an email for a session-complete confirmation. Your terminal history remains local unless you submit it.</p><form id="session-email-form"><label>Email<br><input required type="email" name="email" autocomplete="email" style="width:100%;box-sizing:border-box;padding:10px;margin:6px 0 12px;border-radius:8px;border:1px solid #315b87;background:#061426;color:#fff"></label><input type="hidden" name="level"><input type="hidden" name="completedAt"><button style="padding:10px 14px;border:0;border-radius:8px;background:#1677ff;color:#fff;font-weight:700">Submit</button> <button type="button" id="session-skip" style="padding:10px 14px;border:1px solid #315b87;border-radius:8px;background:#061426;color:#fff">Not now</button><p id="session-email-status" aria-live="polite"></p></form>';
    document.body.appendChild(dialog);
    const inner = dialog.querySelector('#session-email-form');
    inner.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new URLSearchParams();
      data.set('form-name', 'session-complete');
      data.set('email', inner.elements.email.value.trim());
      data.set('level', location.pathname.split('/').filter(Boolean)[0] || 'learning');
      data.set('completedAt', new Date().toISOString());
      const status = dialog.querySelector('#session-email-status');
      try {
        const response = await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: data.toString() });
        if (!response.ok) throw new Error('submission failed');
        status.textContent = 'Session saved. Thank you.';
        setTimeout(() => dialog.remove(), 1400);
      } catch {
        status.textContent = 'Could not submit right now. Please try again later.';
      }
    });
    dialog.querySelector('#session-skip').addEventListener('click', () => dialog.remove());
  };
  window.addEventListener('linuxterminal:session-complete', show);
})();
