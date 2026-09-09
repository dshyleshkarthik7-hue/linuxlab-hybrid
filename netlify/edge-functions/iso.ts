const TIMEOUT_MS = 120_000;

type ImageName = 'developer' | 'virt' | 'linux4';

type ImageSource = {
  primary: string;
  fallback?: string;
};

const IMAGES: Record<ImageName, ImageSource> = {
  developer: {
    primary: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso',
    fallback: 'https://api.github.com/repos/dshyleshkarthik7-hue/linuxlab-hybrid/releases/assets/533942157',
  },
  virt: {
    primary: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/V2.00/alpine-virt-3.24.1-x86.iso',
    fallback: 'https://api.github.com/repos/dshyleshkarthik7-hue/linuxlab-hybrid/releases/assets/552238914',
  },
  linux4: {
    primary: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v3.00/linux4.iso',
    fallback: 'https://huggingface.co/datasets/shyleshkarthikd/linux4/resolve/main/linux4.iso?download=true',
  },
};

const FORWARDED_HEADERS = [
  'Content-Type',
  'Content-Length',
  'Content-Range',
  'Accept-Ranges',
  'ETag',
  'Last-Modified',
] as const;

function parseImage(request: Request): ImageName | null {
  const image = new URL(request.url).searchParams.get('image');
  if (image === null || image === '') return 'developer';
  return image === 'virt' || image === 'linux4' ? image : null;
}

function corsHeaders(): Headers {
  return new Headers({
    'Access-Control-Allow-Origin': new URL('https://linuxterminal.me').origin,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified',
  });
}

function invalidRange(range: string | null): boolean {
  return range !== null && (!/^bytes=(\d*)-(\d*)$/.test(range.trim()) || range.includes(','));
}

async function fetchSource(
  source: string,
  request: Request,
  signal: AbortSignal,
): Promise<Response> {
  const headers = new Headers({
    'User-Agent': 'LinuxTerminal-ISO-Relay/1.1',
    Accept: 'application/octet-stream',
  });

  const range = request.headers.get('Range');
  if (range) headers.set('Range', range);

  return fetch(source, {
    method: request.method,
    headers,
    redirect: 'follow',
    signal,
  });
}

function unavailable(status: number, cors: Headers): Response {
  const headers = new Headers(cors);
  headers.set('Cache-Control', 'no-store');
  return new Response(`ISO unavailable (${status})`, { status, headers });
}

export default async function handler(request: Request): Promise<Response> {
  const cors = corsHeaders();

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const headers = new Headers(cors);
    headers.set('Allow', 'GET, HEAD, OPTIONS');
    return new Response('Method Not Allowed', { status: 405, headers });
  }

  const image = parseImage(request);
  if (!image) return new Response('Unknown image', { status: 404, headers: cors });

  const range = request.headers.get('Range');
  if (invalidRange(range)) {
    const headers = new Headers(cors);
    headers.set('Accept-Ranges', 'bytes');
    return new Response('Invalid Range', { status: 416, headers });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const source = IMAGES[image];
    let upstream: Response;
    try {
      upstream = await fetchSource(source.primary, request, controller.signal);
    } catch (primaryError) {
      if (!source.fallback) throw primaryError;
      console.warn('[LinuxLab] Primary ISO source failed; trying fallback', {
        image,
        message: primaryError instanceof Error ? primaryError.message : String(primaryError),
      });
      upstream = await fetchSource(source.fallback, request, controller.signal);
    }

    if (
      !upstream.ok &&
      upstream.status !== 206 &&
      source.fallback &&
      upstream.url !== source.fallback
    ) {
      console.warn('[LinuxLab] Primary ISO returned an error; trying fallback', {
        image,
        status: upstream.status,
      });
      upstream = await fetchSource(source.fallback, request, controller.signal);
    }

    if (!upstream.ok && upstream.status !== 206) {
      return unavailable(upstream.status, cors);
    }

    if (range && upstream.status !== 206) {
      const headers = new Headers(cors);
      headers.set('Accept-Ranges', 'bytes');
      return new Response('Upstream does not support byte ranges', { status: 502, headers });
    }

    const headers = new Headers(cors);
    for (const name of FORWARDED_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }

    headers.set('Content-Type', headers.get('Content-Type') ?? 'application/octet-stream');
    headers.set('Accept-Ranges', headers.get('Accept-Ranges') ?? 'bytes');
    headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');

    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    console.error('[LinuxLab] ISO relay request failed', {
      image,
      message: error instanceof Error ? error.message : String(error),
    });
    const headers = new Headers(cors);
    headers.set('Cache-Control', 'no-store');
    return new Response('ISO temporarily unavailable', { status: 502, headers });
  } finally {
    clearTimeout(timer);
  }
}
