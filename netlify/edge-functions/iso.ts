const DEVELOPER_ISO = 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso';
const VIRT_ISO = 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/V2.00/alpine-virt-3.24.1-x86.iso';
const TIMEOUT_MS = 120_000;
const DEVELOPER_FALLBACK = 'https://api.github.com/repos/dshyleshkarthik7-hue/linuxlab-hybrid/releases/assets/533942157';
const VIRT_FALLBACK = 'https://api.github.com/repos/dshyleshkarthik7-hue/linuxlab-hybrid/releases/assets/552238914';
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Range','Access-Control-Expose-Headers':'Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified'};
export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed',{status:405,headers:{...cors,Allow:'GET, HEAD, OPTIONS'}});
  const url=new URL(request.url), image=url.searchParams.get('image');
  if(image && image!=='virt') return new Response('Unknown image',{status:404,headers:cors});
  const source=image==='virt'?VIRT_ISO:DEVELOPER_ISO, range=request.headers.get('Range');
  if(range && (!/^bytes=(\d*)-(\d*)$/.test(range.trim()) || range.includes(','))) return new Response('Invalid Range',{status:416,headers:{...cors,'Accept-Ranges':'bytes'}});
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  try {
    const upstreamHeaders=new Headers({'User-Agent':'LinuxTerminal-ISO-Relay/1.0','Accept':'application/octet-stream'}); if(range) upstreamHeaders.set('Range',range);
    let upstream=await fetch(source,{method:request.method,headers:upstreamHeaders,redirect:'follow',signal:controller.signal});
    if(!upstream.ok && upstream.status!==206 && [401,403,429,502,503].includes(upstream.status)){
      const fallback=image==='virt'?VIRT_FALLBACK:DEVELOPER_FALLBACK;
      const apiHeaders=new Headers(upstreamHeaders);apiHeaders.set('Accept','application/octet-stream');
      upstream=await fetch(fallback,{method:request.method,headers:apiHeaders,redirect:'follow',signal:controller.signal});
    }
    if(!upstream.ok && upstream.status!==206) return new Response('ISO unavailable ('+upstream.status+')',{status:upstream.status,headers:{...cors,'Cache-Control':'no-store'}});
    if(range && upstream.status!==206) return new Response('Upstream does not support byte ranges',{status:502,headers:{...cors,'Accept-Ranges':'bytes'}});
    const out=new Headers(cors);
    for(const key of ['Content-Type','Content-Length','Content-Range','Accept-Ranges','ETag','Last-Modified']) { const value=upstream.headers.get(key); if(value) out.set(key,value); }
    if(!out.has('Content-Type')) out.set('Content-Type','application/octet-stream');
    if(!out.has('Accept-Ranges')) out.set('Accept-Ranges','bytes');
    out.set('Cache-Control','public, max-age=3600, s-maxage=86400');
    return new Response(request.method==='HEAD'?null:upstream.body,{status:upstream.status,headers:out});
  } catch { return new Response('ISO temporarily unavailable',{status:502,headers:{...cors,'Cache-Control':'no-store'}}); }
  finally { clearTimeout(timer); }
}