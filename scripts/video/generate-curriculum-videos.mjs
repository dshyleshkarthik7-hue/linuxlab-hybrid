#!/usr/bin/env node
/**
 * Render lesson videos from the structured curriculum using the existing,
 * shell-free FFmpeg renderer. This is an offline build tool; it does not run
 * tutorial commands and never fabricates terminal output.
 *
 * Usage:
 *   node scripts/video/generate-curriculum-videos.mjs --limit 5
 *   node scripts/video/generate-curriculum-videos.mjs --all
 *   node scripts/video/generate-curriculum-videos.mjs --track Networking --limit 20
 */
import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateVideo } from './generate-tutorial-video.mjs';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const args = process.argv.slice(2);
const limitIndex = args.indexOf('--limit');
const trackIndex = args.indexOf('--track');
const all = args.includes('--all');
const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : (all ? Infinity : 5);
const track = trackIndex >= 0 ? args[trackIndex + 1] : '';
if (!(limit === Infinity || (Number.isInteger(limit) && limit > 0))) {
  throw new Error('--limit must be a positive integer.');
}
if (limit === Infinity && !all) throw new Error('Use --all to explicitly render the full curriculum.');
const curriculum = JSON.parse(await readFile(path.join(root, 'learn/curriculum.json'), 'utf8'));
if (!Array.isArray(curriculum.lessons) || curriculum.lessons.length !== curriculum.lessonCount) {
  throw new Error('Curriculum data is empty or its lesson count is inconsistent.');
}
const selected = curriculum.lessons.filter(lesson => !track || lesson.track.toLowerCase().includes(track.toLowerCase())).slice(0, limit);
if (!selected.length) throw new Error('No curriculum lessons matched the requested track.');
const outputRoot = path.join(root, 'public', 'tutorial-videos');
await mkdir(outputRoot, { recursive: true });
const manifest = [];
const inputRoot = await mkdtemp(path.join(os.tmpdir(), 'linuxterminal-curriculum-video-'));
let failed = 0;
for (let i = 0; i < selected.length; i++) {
  const lesson = selected[i];
  const slug = String(lesson.id).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  const output = path.join(outputRoot, slug + '.mp4');
  const videoLesson = {
    title: lesson.title,
    slides: [
      { command: lesson.topic || lesson.title, explanation: lesson.objective },
      { command: lesson.workedExample || 'No command supplied', explanation: lesson.explanation },
      { command: 'Expected result', explanation: lesson.expectedResult },
      { command: 'Practice', explanation: lesson.exercise },
      { command: 'Knowledge check', explanation: lesson.knowledgeCheck }
    ]
  };
  const input = path.join(inputRoot, slug + '.json');
  try {
    await writeFile(input, JSON.stringify(videoLesson, null, 2) + '\n', 'utf8');
    await generateVideo(input, output);
    manifest.push({ id: lesson.id, title: lesson.title, video: path.basename(output), status: 'rendered' });
    process.stdout.write('[' + (i + 1) + '/' + selected.length + '] ' + lesson.title + '\n');
  } catch (error) {
    failed++;
    manifest.push({ id: lesson.id, title: lesson.title, status: 'failed', error: String(error.message || error) });
    process.stderr.write('Failed: ' + lesson.title + ': ' + String(error.message || error) + '\n');
  }
}
await writeFile(path.join(outputRoot, 'manifest.json'), JSON.stringify({ totalSelected: selected.length, rendered: manifest.filter(x => x.status === 'rendered').length, failed, lessons: manifest }, null, 2) + '\n', 'utf8');
process.stdout.write('Video batch finished: ' + manifest.filter(x => x.status === 'rendered').length + '/' + selected.length + ' rendered. Videos will be included in the next static-site build from public/tutorial-videos/. Manifest: public/tutorial-videos/manifest.json\n');
await rm(inputRoot, { recursive: true, force: true });
if (failed) process.exitCode = 1;
