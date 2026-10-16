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
import { spawnSync } from 'node:child_process';
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
for (const binary of [process.env.FFMPEG || 'ffmpeg', process.env.FFPROBE || 'ffprobe']) {
  const probe = spawnSync(binary, ['-version'], { encoding: 'utf8', windowsHide: true });
  if (probe.error || probe.status !== 0) {
    throw new Error('Required video tool is unavailable: ' + binary + '. Install FFmpeg with drawtext/libx264 and ffprobe, then retry.');
  }
}
const curriculum = JSON.parse(await readFile(path.join(root, 'learn/curriculum.json'), 'utf8'));
if (!Array.isArray(curriculum.lessons) || curriculum.lessons.length !== curriculum.lessonCount) {
  throw new Error('Curriculum data is empty or its lesson count is inconsistent.');
}
const selected = curriculum.lessons.filter(lesson => !track || lesson.track.toLowerCase().includes(track.toLowerCase())).slice(0, limit);
if (!selected.length) throw new Error('No curriculum lessons matched the requested track.');
const outputRoot = path.join(root, 'public', 'tutorial-videos');
await mkdir(outputRoot, { recursive: true });
const manifestPath = path.join(outputRoot, 'manifest.json');
let priorEntries = [];
try {
  const prior = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (Array.isArray(prior.lessons)) priorEntries = prior.lessons;
} catch { /* First run: no manifest exists yet. */ }
const entriesById = new Map(priorEntries.filter(entry => entry && typeof entry.id === 'string').map(entry => [entry.id, entry]));
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
    entriesById.set(lesson.id, { id: lesson.id, title: lesson.title, video: path.basename(output), status: 'rendered' });
    process.stdout.write('[' + (i + 1) + '/' + selected.length + '] ' + lesson.title + '\n');
  } catch (error) {
    failed++;
    entriesById.set(lesson.id, { id: lesson.id, title: lesson.title, status: 'failed', error: String(error.message || error) });
    process.stderr.write('Failed: ' + lesson.title + ': ' + String(error.message || error) + '\n');
  }
}
const manifest = [...entriesById.values()];
const selectedRendered = selected.filter(lesson => entriesById.get(lesson.id)?.status === 'rendered').length;
await writeFile(manifestPath, JSON.stringify({ schemaVersion: 1, totalSelected: selected.length, rendered: manifest.filter(x => x.status === 'rendered').length, failed: manifest.filter(x => x.status === 'failed').length, lessons: manifest }, null, 2) + '\n', 'utf8');
process.stdout.write('Video batch finished: ' + selectedRendered + '/' + selected.length + ' selected lessons rendered. Manifest retains prior entries at public/tutorial-videos/manifest.json\n');
await rm(inputRoot, { recursive: true, force: true });
if (failed) process.exitCode = 1;
