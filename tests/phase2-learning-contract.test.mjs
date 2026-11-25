import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [guidedHtml, guidedJs, guidedPublicJs, guidedDataText, vite, tutorHtml, tutorJs, tutorCss, quiz, quizHtml, progressHtml, progressJs, ledger, databaseBuilder, pkg] = await Promise.all([
  read('challenges/index.html'),
  read('challenges/challenges.js'),
  read('public/challenges/challenges.js'),
  read('public/guided-challenges.json'),
  read('vite.config.ts'),
  read('tutor/index.html'),
  read('tutor/tutor.js'),
  read('tutor/tutor.css'),
  read('src/quiz.ts'),
  read('quiz/index.html'),
  read('progress/index.html'),
  read('progress/progress.js'),
  read('public/progress.js'),
  read('scripts/commands/build-database.mjs'),
  read('package.json')
]);
const guidedData = JSON.parse(guidedDataText);

assert.match(guidedHtml, /id="guided-list"/);
assert.match(guidedHtml, /6,161 Linux command catalog entries/);
assert.match(guidedHtml, /not authored exercises/);
assert.match(guidedJs, /index === task.answerIndex/);
assert.match(guidedJs, /completeTutorial\(doneId/);
assert.match(guidedJs, /catalogue entries marked seen/);
assert.match(guidedPublicJs, /initGuidedChallenges/);
assert.match(guidedPublicJs, /completeTutorial\(doneId/);
assert.equal(guidedData.challenges.length, 15, 'guided scenario count is explicit');
assert.match(databaseBuilder, /catalogEntryCount:records\.length/);
assert.match(databaseBuilder, /guidedChallengeCount/);

assert.match(quiz, /fetch\('\/guided-challenges\.json'/);
assert.match(quiz, /QUESTIONS\.push\(\.\.\.COMMON\)/);
assert.doesNotMatch(quiz, /command-records\.json/);
assert.match(quizHtml, /currently available Linux question bank/i);
assert.doesNotMatch(quizHtml, /500 Linux Quiz/);
assert.doesNotMatch(quizHtml, /500 available questions per session/);

assert.match(progressHtml, /catalogue entries marked seen/);
assert.match(progressHtml, /guided scenarios completed/);
assert.match(progressJs, /guidedChallengeCount/);
assert.match(progressJs, /reviewedCommandCount/);
assert.match(progressJs, /not an externally verified credential/);
assert.match(ledger, /guidedChallengeCount/);
assert.match(ledger, /completed\s*>=\s*required/);
assert.match(ledger, /reviewedCommandCount/);
assert.match(ledger, /learning-completion-v2/);
assert.match(ledger, /criteriaVersion:2/);
assert.match(progressJs, /learning-completion-v2/);
assert.equal(progressHtml.split('<script src="/progress.js"').length - 1, 1, 'the local progress ledger must load exactly once');

assert.match(vite, /tutor:\s*entry\('tutor\/index\.html'\)/, 'Tutor page must be included in Vite production build');
assert.match(tutorHtml, /<title>Lincyb/);
assert.match(tutorHtml, /Do not paste passwords, API keys, private keys/);
assert.match(tutorHtml, /id="voice-input"/);
assert.match(tutorJs, /fetch\('\/api\/tutor'/);
assert.match(tutorJs, /answer\.textContent/);
assert.doesNotMatch(tutorJs, /innerHTML\s*=/);
assert.match(tutorJs, /SpeechRecognition/);
assert.match(tutorJs, /speechSynthesis/);
assert.match(tutorJs, /pagehide/);
assert.match(tutorCss, /prefers-reduced-motion/);
assert.match(quiz, /scenario-path/);
assert.match(quiz, /scenario-hostkey/);
assert.ok((quiz.match(/id: 'scenario-/g) || []).length >= 25);
assert.match(pkg.scripts['test:ci'], /test:phase2-learning/);
assert.match(pkg.scripts.test, /test:phase2-learning/);

assert.match(ledger, /expectedQuizSize/, 'local completion must require the full published quiz');
assert.match(progressJs, /practiceQuizSize/);
assert.ok(databaseBuilder.includes('practiceQuizSize:guidedChallengeCount+35'));
assert.match(databaseBuilder, /challengeCount:guidedChallengeCount/);
assert.match(quiz, /SESSION_SIZE = 50/);
assert.equal(progressHtml.split('<script src="/progress.js"').length - 1, 1, 'the local progress ledger must load exactly once');
console.log('Guided learning, accurate catalogue metrics, curated quiz, tutor, and progress contracts passed.');
