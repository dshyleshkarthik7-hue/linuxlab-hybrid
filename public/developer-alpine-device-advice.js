(() => {
  const constrained = (Number(navigator.deviceMemory) > 0 && Number(navigator.deviceMemory) <= 4)
    || (Number(navigator.hardwareConcurrency) > 0 && Number(navigator.hardwareConcurrency) <= 4);
  if (!constrained) return;
  const main = document.querySelector('main');
  if (!main || document.querySelector('[data-constrained-device-advice]')) return;
  const note = document.createElement('aside');
  note.dataset.constrainedDeviceAdvice = 'true';
  note.setAttribute('role', 'note');
  note.setAttribute('aria-label', 'Performance recommendation');
  note.style.cssText = 'margin:1rem 0;padding:1rem;border:1px solid #6b8aa8;border-radius:.75rem;background:#0b1b2b;color:#f1f5f9';
  const message = document.createElement('p');
  message.textContent = 'This device reports limited memory or CPU capacity. Developer Alpine may load slowly or use substantial memory; Quick Linux is a lighter alternative.';
  const link = document.createElement('a');
  link.href = '/real-linux/';
  link.textContent = 'Switch to Quick Linux';
  link.style.cssText = 'display:inline-block;padding:.5rem .75rem;border-radius:.4rem;background:#164e63;color:#fff;text-decoration:underline';
  note.append(message, link);
  main.prepend(note);
})();
