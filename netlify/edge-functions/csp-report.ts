const MAX_REPORT_BYTES = 32768;
const MAX_REPORTS_PER_WINDOW = 20;
const RATE_WINDOW_SECONDS = 60;
const MAX_LOG_FIELD_BYTES = 512;
const UPSTASH_URL = Netlify.env.get('UPSTASH_REDIS_REST_URL');
const UPSTASH_TOKEN = Netlify.env.get('UPSTASH_REDIS_REST_TOKEN');

type EdgeContext = { ip?: string };

type CspReport = Record<string, unknown>;

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  if (origin === 'https://linuxterminal.me' || origin === 'https://www.linuxterminal.me') {
    return { 'access-control-allow-origin': origin, vary: 'Origin' };
  }
  return {};
}

function clientKey(context: EdgeContext): string {
  return context.ip?.trim() || 'unknown';
}

async function rateLimited(context: EdgeContext): Promise<boolean> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return true;
  const key = `linuxterminal:csp:${clientKey(context).replace(/[^a-zA-Z0-9:._-]/g, '_')}`;
  const script = `
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count >= limit then return -1 end
if count == 0 then redis.call('SET', KEYS[1], '1', 'EX', ttl); return 1 end
return redis.call('INCR', KEYS[1])
`;
  try {
    const response = await fetch(UPSTASH_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${UPSTASH_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify([
        'EVAL',
        script,
        '1',
        key,
        String(MAX_REPORTS_PER_WINDOW),
        String(RATE_WINDOW_SECONDS),
      ]),
    });
    if (!response.ok) return true;
    const data: unknown = await response.json();
    const result = typeof data === 'object' && data !== null && 'result' in data
      ? (data as { result?: unknown }).result
      : null;
    return typeof result !== 'number' || result < 0;
  } catch {
    return true;
  }
}

function safeField(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return normalized.length > MAX_LOG_FIELD_BYTES
    ? `${normalized.slice(0, MAX_LOG_FIELD_BYTES)}…`
    : normalized;
}

function sanitizeReport(parsed: CspReport): Record<string, string> {
  const source = parsed['csp-report'];
  const report = typeof source === 'object' && source !== null && !Array.isArray(source)
    ? source as CspReport
    : parsed;
  const fields = [
    'document-uri',
    'referrer',
    'violated-directive',
    'effective-directive',
    'original-policy',
    'blocked-uri',
    'source-file',
    'status-code',
  ];
  const safe: Record<string, string> = {};
  for (const field of fields) {
    const value = safeField(report[field]);
    if (value) safe[field] = value;
  }
  return safe;
}

export default async (request: Request, context: EdgeContext): Promise<Response> => {
  const headers = cors(request);
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...headers,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      },
    });
  }
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'POST, OPTIONS', ...headers },
    });
  }
  if (await rateLimited(context)) {
    return new Response('Too Many Requests', {
      status: 429,
      headers: { ...headers, 'Retry-After': '60', 'Cache-Control': 'no-store' },
    });
  }

  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_REPORT_BYTES)) {
    return new Response('Payload Too Large', { status: 413, headers });
  }
  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_REPORT_BYTES) {
      return new Response('Payload Too Large', { status: 413, headers });
    }
    const text = new TextDecoder().decode(bytes);
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return new Response('Invalid report', { status: 400, headers });
    }
    console.log('[CSP_REPORT]', JSON.stringify(sanitizeReport(parsed as CspReport)));
    return new Response(null, {
      status: 204,
      headers: { ...headers, 'Cache-Control': 'no-store' },
    });
  } catch {
    return new Response('Invalid report', { status: 400, headers });
  }
};

export const config = { path: '/api/csp-report' };
