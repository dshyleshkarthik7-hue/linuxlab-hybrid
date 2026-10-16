#!/usr/bin/env node
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
const WIDTH = 1280, HEIGHT = 720, FPS = 24, DEFAULT_SECONDS = 5;
function wrapText(value, limit = 52) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean), lines = [];
  let line = '';
  for (const word of words) {
    if (word.length > limit) { if (line) lines.push(line); line = ''; for (let i=0;i<word.length;i+=limit) lines.push(word.slice(i,i+limit)); }
    else if (!line) line = word;
    else if ((line + ' ' + word).length <= limit) line += ' ' + word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}
export function validateLesson(lesson) {
  if (!lesson || typeof lesson !== 'object' || Array.isArray(lesson)) throw new Error('Input must be a JSON object.');
  if (typeof lesson.title !== 'string' || !lesson.title.trim()) throw new Error('Lesson requires a non-empty title.');
  if (!Array.isArray(lesson.slides) || lesson.slides.length < 1 || lesson.slides.length > 40) throw new Error('Slides must contain 1–40 entries.');
  lesson.slides.forEach((slide,i) => {
    if (!slide || typeof slide.command !== 'string' || !slide.command.trim()) throw new Error('Slide '+(i+1)+' requires a command.');
    if (typeof slide.explanation !== 'string' || !slide.explanation.trim()) throw new Error('Slide '+(i+1)+' requires an explanation.');
    if (slide.verified_output !== undefined && typeof slide.verified_output !== 'string') throw new Error('verified_output must be text.');
    if (slide.seconds !== undefined && (!Number.isFinite(slide.seconds) || slide.seconds < 2 || slide.seconds > 20)) throw new Error('Slide seconds must be between 2 and 20.');
  });
  return lesson;
}
function filterPath(value) { return path.resolve(value).replace(/\\/g,'\\\\').replace(/:/g,'\\:').replace(/'/g,"\\'").replace(/,/g,'\\,').replace(/\[/g,'\\[').replace(/\]/g,'\\]'); }
function run(command,args) {
  const result=spawnSync(command,args,{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
  if(result.error) throw new Error('Could not run '+command+': '+result.error.message);
  if(result.status!==0) throw new Error(command+' failed: '+(result.stderr||result.stdout||'').trim().slice(-3000));
  return result.stdout;
}
function slideText(title,slide,index,total) {
  // Keep each slide readable at 720p even when source lesson fields are long.
  // The source JSON remains complete; only the video slide is shortened.
  const clipped=(value,limit)=>{const lines=wrapText(value,limit);return lines.length>limit? [...lines.slice(0,limit-1),'…']:lines;};
  const lines=[...clipped(title.trim(),1),'',...clipped('$ '+slide.command.trim(),3),'',...clipped(slide.explanation,5)];
  if(slide.verified_output) lines.push('','Output:',...clipped(slide.verified_output,2));
  lines.push('','LinuxTerminal.me - '+(index+1)+'/'+total);
  return lines.join('\n');
}
export async function generateVideo(inputPath,outputPath,options={}) {
  const lesson=validateLesson(JSON.parse(await readFile(inputPath,'utf8'))), output=path.resolve(outputPath);
  await mkdir(path.dirname(output),{recursive:true});
  const temp=await mkdtemp(path.join(os.tmpdir(),'linuxterminal-video-'));
  try {
    const segments=[];
    for(let i=0;i<lesson.slides.length;i++) {
      const slide=lesson.slides[i], textPath=path.join(temp,'slide-'+String(i).padStart(3,'0')+'.txt'), segmentPath=path.join(temp,'segment-'+String(i).padStart(3,'0')+'.mp4');
      await writeFile(textPath,slideText(lesson.title,slide,i,lesson.slides.length),'utf8');
      const seconds=slide.seconds===undefined?DEFAULT_SECONDS:slide.seconds, fontFile=options.fontFile||process.env.LINUXTERMINAL_VIDEO_FONT;
      const fontArg=fontFile?"fontfile='"+filterPath(fontFile)+"':":'';
      const filter='drawtext='+fontArg+"textfile='"+filterPath(textPath)+"':expansion=none:fontcolor=white:fontsize=30:line_spacing=10:x=72:y=110:box=1:boxcolor=0x101820@0.88:boxborderw=28";
      run(options.ffmpeg||process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=0x101820:s='+WIDTH+'x'+HEIGHT+':r='+FPS+':d='+seconds,'-vf',filter,'-t',String(seconds),'-an','-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p',segmentPath]);
      segments.push(segmentPath);
    }
    const listPath=path.join(temp,'concat.txt');
    await writeFile(listPath,segments.map(file=>"file '"+file.replace(/'/g,"'\\''")+"'").join('\n')+'\n','utf8');
    run(options.ffmpeg||process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',listPath,'-c','copy','-movflags','+faststart',output]);
    run(options.ffprobe||process.env.FFPROBE||'ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,width,height','-of','csv=p=0',output]);
    return output;
  } finally { await rm(temp,{recursive:true,force:true}); }
}
async function main(args) {
  if(args.length===2&&args[0]==='--validate') { validateLesson(JSON.parse(await readFile(args[1],'utf8'))); process.stdout.write('Video lesson schema is valid.\n'); return; }
  if(args.length<2||args.length>3||args.includes('--help')) {
    process.stdout.write('Usage: node scripts/video/generate-tutorial-video.mjs <lesson.json> <output.mp4> [font-file]\n       node scripts/video/generate-tutorial-video.mjs --validate <lesson.json>\nRequires ffmpeg and ffprobe. Narration is not synthesized.\n');
    if(args.includes('--help')||args.length===0) return; process.exitCode=2; return;
  }
  process.stdout.write('Rendered and validated '+await generateVideo(args[0],args[1],{fontFile:args[2]})+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2)).catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
