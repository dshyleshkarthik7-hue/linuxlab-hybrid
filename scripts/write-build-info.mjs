import { mkdir, writeFile } from 'node:fs/promises';
const commit=process.env.COMMIT_REF||process.env.GITHUB_SHA||'local';
const context=process.env.CONTEXT||'dev';
await mkdir('dist',{recursive:true});
await writeFile('dist/build-info.json',JSON.stringify({commit,context,builtAt:new Date().toISOString()})+'\n');
