const GITHUB_ISO_URL =
  'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
  'Access-Control-Expose-Headers':
    'Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified',
};

export default async function handler(request: Request): Promise<Response> {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD, OPTIONS', ...corsHeaders },
    });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const forwardHeaders = new Headers({
    'User-Agent': 'LinuxLab-Edge-Stream/1.0',
  });

  const range = request.headers.get('Range');
  if (range) forwardHeaders.set('Range', range);

  try {
    const upstream = await fetch(GITHUB_ISO_URL, {
      method: request.method,
      headers: forwardHeaders,
      redirect: 'follow',
    });

    const responseHeaders = new Headers(upstream.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value);
    });

    // Keep byte-range semantics explicit for v86 and intermediaries.
    if (range && !responseHeaders.has('Accept-Ranges')) {
      responseHeaders.set('Accept-Ranges', 'bytes');
    }

    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('[LinuxLab] ISO upstream request failed', error);
    return new Response('ISO upstream unavailable', {
      status: 502,
      headers: corsHeaders,
    });
  }
}
