/** Shared indexing policy: catalogue presence alone is not editorial completion. */
export function isCommandIndexable(command, intelligenceRecord) {
  if (command?.page?.status === 'complete' && command?.page?.source) return true;
  const lesson = intelligenceRecord || command?.intelligence || {};
  const reviewed = command?.intelligence?.status === 'complete' || intelligenceRecord?.status === 'complete';
  return Boolean(reviewed && String(lesson.definition || lesson.explanation || '').trim() && String(lesson.syntax || '').trim() && Array.isArray(lesson.examples) && lesson.examples.some((example) => typeof example === 'string' && example.trim()) && Array.isArray(lesson.internals) && lesson.internals.length > 0);
}
export function commandCanonicalUrl(command, base = 'https://linuxterminal.me') {
  if (typeof command?.url !== 'string' || !command.url.startsWith('/commands/') || command.url.startsWith('//')) throw new Error('Invalid command canonical URL: ' + (command?.name || '(unknown)'));
  return base.replace(/\/$/, '') + command.url;
}
export function commandRobotsContent(command, intelligenceRecord) {
  return isCommandIndexable(command, intelligenceRecord) ? 'index,follow,max-image-preview:large' : 'noindex,follow';
}
