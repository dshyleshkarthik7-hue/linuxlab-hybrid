/* Command intelligence is embedded into curated/generated command pages at build time
 * from .cache/command-intelligence.json. There is intentionally no public JSON endpoint.
 * This file remains as a no-op for any legacy script references.
 */
(() => {
  const mount = document.querySelector('[data-command-intelligence]');
  if (!mount) return;
  // Build-time pages already contain the lesson body. Do not fetch a public JSON catalog.
  mount.setAttribute('data-intelligence-source', 'build-time');
})();
