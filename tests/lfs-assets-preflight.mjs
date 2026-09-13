import { stat, readFile } from 'node:fs/promises';

const expected = new Map([
  ['public/seabios.bin', 131072],
  ['public/vgabios.bin', 36352],
]);
for (const [path, size] of expected) {
  let bytes;
  try { bytes = await readFile(path); } catch { throw new Error(`Missing required LFS asset: ${path}. Run git lfs install && git lfs pull.`); }
  const text = bytes.subarray(0, 64).toString('utf8');
  if (text.startsWith('version https://git-lfs.github.com/spec/v1')) {
    throw new Error(`${path} is still a Git LFS pointer. Run git lfs install && git lfs pull.`);
  }
  const actual = (await stat(path)).size;
  if (actual !== size) throw new Error(`${path} has ${actual} bytes; expected ${size}.`);
}
console.log('Required v86 LFS firmware assets are present and materialized.');
