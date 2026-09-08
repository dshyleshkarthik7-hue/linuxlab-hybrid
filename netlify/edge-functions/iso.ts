const ALPINE_ISO = 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso';
const TIMEOUT_MS = 60_000;
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified'
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed',{status:405,headers:{...headers,Allow:'GET, HEAD, OPTIONS'}});
  const range=request.headers.get('Range');
  if (range && (!/^bytes=(\d*)-(\d*)$/.test(range.trim()) || range.includes(','))) {
    return new Response('Invalid Range',{status:416,headers:{...headers,'Accept-Ranges':'bytes'}});
  }
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  try {
    const upstreamHeaders=new Headers();
    if(range) upstreamHeaders.set('Range',range);
    const upstream=await fetch(ALPINE_ISO,{method:request.method,headers:upstreamHeaders,redirect:'follow',signal:controller.signal});
    const wantsRange=Boolean(range);
    if(wantsRange && (upstream.status!==206 || !upstream.headers.get('Content-Range'))) {
      await upstream.body?.cancel();
      return new Response('Upstream does not support byte ranges',{status:502,headers:{...headers,'Accept-Ranges':'bytes'}});
    }
    if(!upstream.ok && upstream.status!==206) return new Response('Alpine ISO unavailable',{status:upstream.status,headers});
    const out=new Headers(headers);
    for(const key of ['Content-Type','Content-Length','Content-Range','Accept-Ranges','ETag','Last-Modified']) {
      const value=upstream.headers.get(key); if(value) out.set(key,value);
    }
    if(!out.has('Accept-Ranges')) out.set('Accept-Ranges','bytes');
    out.set('Cache-Control','public, max-age=3600, s-maxage=86400');
    return new Response(request.method==='HEAD'?null:upstream.body,{status:upstream.status,headers:out});
  } catch {
    return new Response('Alpine ISO temporarily unavailable',{status:502,headers:{...headers,'Cache-Control':'no-store'}});
  } finally { clearTimeout(timer); }
}