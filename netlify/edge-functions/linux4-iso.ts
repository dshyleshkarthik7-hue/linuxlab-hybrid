const UPSTREAM = 'https://huggingface.co/buckets/shyleshkarthikd/alpine-iso-bucket/resolve/linux4.iso?download=true';

function corsOrigin(origin) {
  if (!origin) return null;
  try {
    const u = new URL(origin);
    if (u.origin === 'https://linuxterminal.me' || u.origin === 'https://www.linuxterminal.me' || u.hostname.endsWith('.netlify.app')) return u.origin;
  } catch {}
  return null;
}

export default async function handler(request) {
  const url = new URL(request.url);
  const origin = corsOrigin(request.headers.get('Origin'));
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': 'Range,Content-Type',
    'Access-Control-Expose-Headers': 'Accept-Ranges,Content-Length,Content-Range,X-LinuxLab-Chunk-Start,X-LinuxLab-Chunk-End,X-LinuxLab-Chunk-Total',
    'Vary': 'Origin',
    'Accept-Ranges': 'bytes',
    'Content-Type': 'application/octet-stream'
  });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  if (request.method === 'OPTIONS') return new Response(null, {status:204,headers});
  if (!['GET','HEAD'].includes(request.method)) return new Response('Method Not Allowed',{status:405,headers});

  const start=url.searchParams.get('chunkStart');
  const end=url.searchParams.get('chunkEnd');
  const range=request.headers.get('Range') || (start !== null && end !== null ? `bytes=${start}-${end}` : null);
  const upstream=await fetch(UPSTREAM,{headers:range?{Range:range}:{}});
  const total=upstream.headers.get('Content-Range')?.match(/\/([0-9]+)$/)?.[1] || '7731200';
  if(upstream.status===416){headers.set('Content-Range',`bytes */${total}`);return new Response(null,{status:416,headers});}
  if(!upstream.ok && upstream.status!==206)return new Response('ISO upstream unavailable',{status:502,headers});
  for(const name of ['Content-Range','Content-Length']) if(upstream.headers.get(name)) headers.set(name,upstream.headers.get(name));
  if(start!==null)headers.set('X-LinuxLab-Chunk-Start',start);
  if(end!==null)headers.set('X-LinuxLab-Chunk-End',end);
  headers.set('X-LinuxLab-Chunk-Total',total);
  return new Response(request.method==='HEAD'?null:upstream.body,{status:upstream.status,headers});
}
