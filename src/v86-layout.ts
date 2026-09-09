function installHeaderResizeObserver(): void {
  const header = document.getElementById('vm-header');
  if (!header) return;

  const updateHeight = (height: number): void => {
    document.documentElement.style.setProperty('--vm-header-height', `${height || 72}px`);
  };

  const observer = new ResizeObserver((entries) => {
    updateHeight(entries[0]?.contentRect.height ?? 72);
  });

  observer.observe(header);
  updateHeight(header.getBoundingClientRect().height);
}

installHeaderResizeObserver();
