export default async function handler(request: Request) {
  const GITHUB_ISO_URL =
    'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso';

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  // Forward HTTP Range headers so v86 can stream disk blocks on demand
  const forwardHeaders = new Headers();
  const range = request.headers.get('Range');
  if (range) {
    forwardHeaders.set('Range', range);
  }
  forwardHeaders.set('User-Agent', 'Netlify-Edge-Stream');

  const upstream = await fetch(GITHUB_ISO_URL, {
    headers: forwardHeaders,
    redirect: 'follow',
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  responseHeaders.set('Access-Control-Allow-Headers', '*');
  responseHeaders.set(
    'Access-Control-Expose-Headers',
    'Content-Length, Content-Range, Accept-Ranges'
  );

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
