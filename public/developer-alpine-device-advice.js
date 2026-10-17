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
  note.className = 'developer-device-advice';
  const message = document.createElement('p');
  message.textContent = 'This device reports limited memory or CPU capacity. Developer Alpine may load slowly or use substantial memory; Quick Linux is a lighter alternative.';
  const link = document.createElement('a');
  link.href = '/real-linux/';
  link.textContent = 'Switch to Quick Linux';
  link.className = 'developer-device-advice-link';
  note.append(message, link);
  main.prepend(note);
})();
