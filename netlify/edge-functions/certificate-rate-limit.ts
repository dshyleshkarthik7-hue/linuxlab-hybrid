import certificate from './certificate.ts';

const UPSTASH_URL = Netlify.env.get('UPSTASH_REDIS_REST_URL');
const UPSTASH_TOKEN = Netlify.env.get('UPSTASH_REDIS_REST_TOKEN');
const LIMIT = 60;
const WINDOW_SECONDS = 60;

async function redis(command: unknown[]): Promise<unknown> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) throw new Error('Upstash is not configured');
  const response = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${UPSTASH_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error('Upstash request failed');
  const payload = await response.json() as { result?: unknown; error?: unknown };
  if (payload.error) throw new Error(String(payload.error));
  return payload.result;
}

function clientKey(request: Request, context: { ip?: string }): string {
  const ip = context.ip || request.headers.get('x-nf-client-connection-ip') || 'unknown';
  return ip.replace(/[^a-zA-Z0-9:._-]/g, '_').slice(0, 128);
}

async function allowed(request: Request, context: { ip?: string }): Promise<boolean> {
  const key = `linuxterminal:rate:certificate-verify:${clientKey(request, context)}`;
  const count = Number(await redis(['INCR', key]));
  if (count === 1) await redis(['EXPIRE', key, WINDOW_SECONDS]);
  return count <= LIMIT;
}

export default async (request: Request, context: { ip?: string }) => {
  if (request.method === 'GET') {
    if (!UPSTASH_URL || !UPSTASH_TOKEN) {
      return new Response(JSON.stringify({ error: 'Certificate verification is temporarily unavailable.' }), {
        status: 503,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    try {
      if (!(await allowed(request, context))) {
        return new Response(JSON.stringify({ error: 'Too many verification requests. Please try again later.' }), {
          status: 429,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'retry-after': String(WINDOW_SECONDS) },
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Certificate verification is temporarily unavailable.' }), {
        status: 503,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
  }
  return certificate(request);
};
