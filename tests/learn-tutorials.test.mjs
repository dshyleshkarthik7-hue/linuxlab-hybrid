import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const indexHtml = await readFile(resolve(root, 'learn/index.html'), 'utf8');
const pages = ['learn/linux-basics/index.html','learn/terminal-navigation/index.html','learn/files-and-directories/index.html','learn/text-processing/index.html','learn/permissions/index.html','learn/processes/index.html','learn/shell-scripting/index.html','learn/operating-systems/index.html','learn/networking-basics/index.html'];
const htmlByPage = await Promise.all(pages.map(async page => [page, await readFile(resolve(root, page), 'utf8')]));
for (const [page, html] of htmlByPage) {
  assert.match(html, /<title>[^<]+<\/title>/i, `${page} needs a title`);
  assert.match(html, /<meta name="description" content="[^"]+">/i, `${page} needs a meta description`);
  assert.match(html, /<link rel="canonical" href="https:\/\/linuxterminal\.me\/learn\//i, `${page} needs a canonical URL`);
  assert.match(html, /<link rel="stylesheet" href="\/learn\/tutorials\.css">/i, `${page} must use shared external CSS`);
  assert.doesNotMatch(html, /<script(?![^>]+\bsrc=)[^>]*>/i, `${page} must not contain inline scripts`);
  assert.match(html, /<h1>[^<]+<\/h1>/i, `${page} needs a visible lesson heading`);
  assert.match(html, /<section class="lesson">/i, `${page} needs structured lesson content`);
  assert.match(html, /<pre>/i, `${page} needs a practical command/example block`);
  assert.match(html, /class="actions"/i, `${page} needs a practice/navigation action area`);
  assert.match(html, /<a href="\/learn\/[^\"]+\/">(?:Next|← Back|Previous)/i, `${page} needs progression navigation`);
  assert.match(html, /<a class="brand" href="\/">/i, `${page} needs consistent home navigation`);
}
const css = await readFile(resolve(root, 'learn/tutorials.css'), 'utf8');
assert.match(css, /\.grid\{/);
assert.match(css, /@media/);
assert.match(css, /prefers-reduced-motion/i, 'Tutorial CSS must respect reduced-motion preferences');
assert.match(indexHtml, /<h1>[^<]+<\/h1>/i, 'Tutorial index needs a visible heading');
assert.match(indexHtml, /class="grid"/i, 'Tutorial index needs a structured lesson grid');
assert.match(indexHtml, /<pre>/i, 'Tutorial index needs practical examples');
assert.match(indexHtml, /class="hero-actions"/i, 'Tutorial index needs clear primary actions');
for (const route of ['/learn/operating-systems/', '/learn/networking-basics/']) assert.ok(indexHtml.includes(`href="${route}"`), `Tutorial index missing ${route}`);
console.log(`Tutorial content contract passed (${pages.length} pages)`);

const curriculum = JSON.parse(await readFile(resolve(root, 'learn/curriculum.json'), 'utf8'));
const libraryHtml = await readFile(resolve(root, 'learn/library/index.html'), 'utf8');
assert.ok(curriculum.lessonCount >= 500, 'The structured curriculum must contain at least 500 lessons');
assert.equal(curriculum.lessons.length, curriculum.lessonCount, 'Curriculum count must match lesson records');
assert.ok(new Set(curriculum.lessons.map(lesson => lesson.id)).size === curriculum.lessonCount, 'Lesson IDs must be unique');
assert.equal(curriculum.schemaVersion, 2, 'Curriculum must use the current validated schema');
assert.equal(curriculum.topicCount, new Set(curriculum.lessons.map(lesson => lesson.topic)).size, 'Declared topic count must match unique topics');
assert.ok(curriculum.topicCount >= 40, 'Curriculum should cover a broad range of distinct topics');
assert.equal(new Set(curriculum.lessons.map(lesson => lesson.exercise)).size, curriculum.lessonCount, 'Learning activities must have distinct exercises, not copied template prompts');
assert.equal(new Set(curriculum.lessons.map(lesson => lesson.objective)).size, curriculum.lessonCount, 'Learning activities must have distinct objectives');
assert.ok(curriculum.lessons.every(lesson => lesson.topic && lesson.tags?.includes(lesson.topic)), 'Each activity must be tied to an explicit topic');
assert.ok(curriculum.lessons.every(lesson => !/catalog entry; purpose and availability are not verified|not a completed learning reference/i.test(lesson.explanation)), 'Curriculum activities must not contain placeholder catalogue copy');
assert.match(libraryHtml, /guided activities/i, 'Library must describe the records accurately as guided activities');
assert.match(libraryHtml, /topic/i, 'Library must communicate its topic-based organization');
for (const lesson of curriculum.lessons) {
  assert.ok(lesson.title && lesson.objective && lesson.explanation && lesson.workedExample && lesson.expectedResult && lesson.exercise && lesson.knowledgeCheck && lesson.answer, `Lesson ${lesson.id} must include all teaching sections`);
}
assert.match(libraryHtml, /id="search"/, 'Learning library needs searchable lessons');
assert.match(libraryHtml, /id="track"/, 'Learning library needs track filtering');
assert.match(libraryHtml, /aria-live="polite"/, 'Search result count should be announced accessibly');
assert.match(libraryHtml, /prefers-reduced-motion:reduce/, 'Learning library must respect reduced motion');
assert.match(libraryHtml, /PAGE_SIZE=60/, 'Learning library must paginate rather than silently hiding results after 180');
assert.match(libraryHtml, /id="previous"/, 'Learning library needs previous-page control');
assert.match(libraryHtml, /id="next"/, 'Learning library needs next-page control');
assert.match(libraryHtml, /cache:"no-store"/, 'Curriculum fetch should avoid stale cached JSON during rollout');
assert.match(libraryHtml, /Array\.isArray\(data\.lessons\)/, 'Curriculum loader must validate the lessons array');
assert.match(libraryHtml, /Incomplete lesson record/, 'Curriculum loader must reject incomplete lesson data');
assert.match(libraryHtml, /data\.lessonCount!==data\.lessons\.length/, 'Curriculum loader must validate declared lesson count');
assert.match(libraryHtml, /Unable to load lessons/, 'Curriculum loader must show a visible error instead of failing silently');
assert.doesNotMatch(libraryHtml, /1106\+ lessons|1106 short lessons/, 'Library count must not advertise a stale lesson total');
const videoBatch = await readFile(resolve(root, 'scripts/video/generate-curriculum-videos.mjs'), 'utf8');
assert.match(videoBatch, /learn\/curriculum\.json/, 'Video batch generator must consume the shared curriculum');
assert.match(videoBatch, /--all/, 'Rendering the entire library must require explicit opt-in');
assert.match(videoBatch, /generateVideo\(input, output\)/, 'Video batch must use the validated FFmpeg renderer');
console.log(`Structured learning library contract passed (${curriculum.lessonCount} lessons)`);
