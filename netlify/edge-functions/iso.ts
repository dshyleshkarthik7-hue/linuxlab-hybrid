const PRIMARY_ISO_URL =
  'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso';
const FALLBACK_ISO_URL =
  'https://huggingface.co/datasets/shyleshkarthikd/alpine-iso/resolve/main/alpine.iso?download=true';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
  'Access-Control-Expose-Headers':
    'Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified, X-LinuxLab-ISO-Source',
};

async function fetchIso(url: string, request: Request): Promise<Response> {
  const forwardHeaders = new Headers({
    'User-Agent': 'LinuxLab-Edge-Stream/1.1',
  });
  const range = request.headers.get('Range');
  if (range) forwardHeaders.set('Range', range);

  return fetch(url, {
    method: request.method,
    headers: forwardHeaders,
    redirect: 'follow',
  });
}

function withSource(upstream: Response, source: string, method: string): Response {
  const responseHeaders = new Headers(upstream.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => responseHeaders.set(key, value));
  responseHeaders.set('X-LinuxLab-ISO-Source', source);

  if (!responseHeaders.has('Accept-Ranges')) {
    responseHeaders.set('Accept-Ranges', 'bytes');
  }

  return new Response(method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

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

  try {
    // GitHub Release is the authoritative primary source.
    const primary = await fetchIso(PRIMARY_ISO_URL, request);
    if (primary.ok || primary.status === 206) {
      return withSource(primary, 'github-release', request.method);
    }

    console.warn(`[LinuxLab] GitHub ISO returned ${primary.status}; trying Hugging Face fallback.`);

    // Hugging Face is only a fallback. Preserve the same Range request.
    const fallback = await fetchIso(FALLBACK_ISO_URL, request);
    if (fallback.ok || fallback.status === 206) {
      return withSource(fallback, 'huggingface-fallback', request.method);
    }

    console.error(`[LinuxLab] ISO sources unavailable: GitHub=${primary.status}, HuggingFace=${fallback.status}`);
    return new Response('ISO upstream unavailable', {
      status: 502,
      headers: { ...corsHeaders, 'X-LinuxLab-ISO-Source': 'unavailable' },
    });
  } catch (error) {
    console.error('[LinuxLab] ISO upstream request failed', error);

    // If the primary request itself failed at the network level, make one fallback attempt.
    try {
      const fallback = await fetchIso(FALLBACK_ISO_URL, request);
      if (fallback.ok || fallback.status === 206) {
        return withSource(fallback, 'huggingface-fallback', request.method);
      }
    } catch (fallbackError) {
      console.error('[LinuxLab] Hugging Face fallback request failed', fallbackError);
    }

    return new Response('ISO upstream unavailable', {
      status: 502,
      headers: { ...corsHeaders, 'X-LinuxLab-ISO-Source': 'unavailable' },
    });
  }
}