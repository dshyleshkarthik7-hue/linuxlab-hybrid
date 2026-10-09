import { MongoClient, ServerApiVersion } from 'mongodb';
import catalog from '../../data/commands/canonical.json' with { type: 'json' };

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'linuxlab';
let mongoPromise: Promise<MongoClient> | null = null;
async function certificatesCollection() {
  if (!MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  if (!mongoPromise) mongoPromise = new MongoClient(MONGODB_URI, { maxPoolSize: 5, maxIdleTimeMS: 30000, retryWrites: true, retryReads: true, serverSelectionTimeoutMS: 8000, serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true } }).connect().catch(error => { mongoPromise = null; throw error; });
  const collection = (await mongoPromise).db(MONGODB_DB).collection('certificates');
  if (!CERT_INDEX_READY.has(collection)) {
    await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'certificates_expiresAt_ttl' });
    CERT_INDEX_READY.add(collection);
  }
  return collection;
}

const EXAM_VERSION = 'linux-foundations-2.1';
const QUESTION_COUNT = 30;
const MIN_QUESTION_BANK_SIZE = 1000;
const PASS_PERCENT = 80;
const ATTEMPT_TTL = 3600;
const VERIFY_RATE_LIMIT = 30;
const EXAM_RATE_LIMIT = 20;
const EXAM_RATE_WINDOW_SECONDS = 3600;
const REVOKED_CERTIFICATE_IDS = new Set((process.env.REVOKED_CERTIFICATE_IDS || '').split(',').map(v => v.trim()).filter(Boolean));
const VERIFY_RATE_WINDOW_SECONDS = 60;
const CERT_TTL = 60 * 60 * 24 * 365 * 5;
const CERT_INDEX_READY = new WeakSet<object>();
const REVOCATION_INDEX_READY = new WeakSet<object>();
const MAX_BODY_BYTES = 16384;
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const UPSTASH_TIMEOUT_MS = Math.max(1000, Number(process.env.UPSTASH_TIMEOUT_MS || 5000));
const SIGNING_KEY_ID = process.env.CERTIFICATE_SIGNING_KEY_ID || 'current';
const SIGNING_KEYS = (() => { const map = new Map<string, string>(); for (const item of (process.env.CERTIFICATE_SIGNING_KEYS || '').split(',').map(x=>x.trim()).filter(Boolean)) { const i=item.indexOf('='); if(i>0) map.set(item.slice(0,i),item.slice(i+1)); } return map; })();
const ALLOWED_ORIGINS = new Set((process.env.CERTIFICATE_ALLOWED_ORIGINS || 'https://linuxterminal.me').split(',').map(value => value.trim()).filter(Boolean));
const corsOrigin = (request: Request) => { const origin = request.headers.get('origin'); return origin && ALLOWED_ORIGINS.has(origin) ? origin : undefined; };

type User = {
  id?: unknown;
  email?: unknown;
  user_metadata?: { full_name?: unknown };
};

type Q = {
  id: string;
  q: string;
  c: string[];
  a: string;
  t: string;
};

type Attempt = {
  userId: string;
  questions: Q[];
  version: string;
  startedAt: string;
};

type SubmissionResult = { userId: string; response: Record<string, unknown> };

type Cert = {
  id: string;
  userId: string;
  name: string;
  score: number;
  total: number;
  percentage: number;
  passed: true;
  issuedAt: string;
  version: string;
  signature: string;
  keyId?: string;
};

type CatalogRecord={name:string;summary?:string;example?:string;category?:string};const COMMAND_RECORDS=(catalog as {records:CatalogRecord[]}).records;
const COMMON_BANK:Q[]=[
{id:'os-kernel',q:'Which component manages core Linux resources such as processes and memory?',c:['the Linux kernel','the shell prompt','the terminal emulator','the browser cache'],a:'the Linux kernel',t:'operating-systems'},
{id:'os-process',q:'What is a process?',c:['a running instance of a program','a filesystem path','a DNS record','a terminal color'],a:'a running instance of a program',t:'operating-systems'},
{id:'os-permission',q:'What do Unix-style file permissions primarily control?',c:['who may read, write, or execute a file','which DNS server is used','CPU frequency','archive compression'],a:'who may read, write, or execute a file',t:'operating-systems'},
{id:'net-dns',q:'Which system maps hostnames to IP addresses?',c:['DNS','SSH','HTTP','ARP only'],a:'DNS',t:'networking'},
{id:'net-route',q:'What does a routing table describe?',c:['where packets should be sent next','file permissions','process environment variables','archive compression'],a:'where packets should be sent next',t:'networking'},
{id:'net-port',q:'What does a TCP or UDP port identify?',c:['a transport-layer endpoint associated with a service','a filesystem inode','a CPU core','a shell alias'],a:'a transport-layer endpoint associated with a service',t:'networking'},
{id:'net-ip',q:'Which Linux command family commonly inspects interfaces and routes?',c:['ip','grep','tar','chmod'],a:'ip',t:'networking'},
];
function buildQuestionBank(): Q[] {
  const result: Q[] = [];
  const names = [...new Set(COMMAND_RECORDS.map(record => String(record.name).trim()).filter(Boolean))];
  const examples = [...new Set(COMMAND_RECORDS.map(record => String(record.example || '').trim()).filter(Boolean))];
  const byCategory = new Map<string, { names: string[]; examples: string[] }>();
  for (const record of COMMAND_RECORDS) {
    const category = String(record.category || 'linux').trim() || 'linux';
    const group = byCategory.get(category) || { names: [], examples: [] };
    const name = String(record.name || '').trim();
    const example = String(record.example || '').trim();
    if (name && !group.names.includes(name)) group.names.push(name);
    if (example && !group.examples.includes(example)) group.examples.push(example);
    byCategory.set(category, group);
  }
  const choices = (answer: string, pool: string[], fallback: string[] = []): string[] => {
    const distractors = [...new Set([...pool, ...fallback])]
      .map(value => String(value).trim())
      .filter(value => value && value !== answer);
    const selected = distractors.slice(0, 3);
    if (selected.length < 3) throw new Error('Verified exam catalog has too few unique distractors');
    const result = [...new Set([answer, ...selected])];
    if (result.length !== 4 || result.filter(value => value === answer).length !== 1) {
      throw new Error('Verified exam question choices must contain four unique options and one answer');
    }
    return result;
  };
  for (const [index, record] of COMMAND_RECORDS.entries()) {
    const name = String(record.name || '').trim();
    if (!name) continue;
    const summary = String(record.summary || '').trim();
    const example = String(record.example || '').trim();
    const category = String(record.category || 'linux').trim() || 'linux';
    const group = byCategory.get(category) || { names: [], examples: [] };
    const otherNames = group.names.filter(value => value !== name);
    const otherExamples = group.examples.filter(value => value !== example);
    if (summary) {
      result.push({
        id: `cmd-${index}-identify`,
        q: `Which command is represented by this catalog description: ${summary}?`,
        c: choices(name, otherNames, names),
        a: name,
        t: category
      });
    }
    if (example) {
      result.push({
        id: `cmd-${index}-example`,
        q: `Which example is associated with the ${name} command record?`,
        c: choices(example, otherExamples, examples),
        a: example,
        t: category
      });
    }
  }
  const bank = [...result, ...COMMON_BANK];
  const seen = new Set<string>();
  for (const question of bank) {
    if (seen.has(question.id)) throw new Error('Verified exam catalog contains duplicate question IDs');
    seen.add(question.id);
    if (question.c.length !== 4 || new Set(question.c).size !== 4 || question.c.filter(choice => choice === question.a).length !== 1) {
      throw new Error('Verified exam question has invalid answer choices: ' + question.id);
    }
  }
  return bank;
}
const BANK=buildQuestionBank();
function shuffle<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const k = random[0] % (i + 1);
    [result[i], result[k]] = [result[k], result[i]];
  }
  return result;
}

async function stableUserShuffle<T>(values: readonly T[], userId: string): Promise<T[]> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${EXAM_VERSION}|${userId}`)));
  let seed = (digest[0] | (digest[1] << 8) | (digest[2] << 16) | (digest[3] << 24)) >>> 0;
  if (seed === 0) seed = 0x9e3779b9;
  const result = [...values];
  const next = () => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17; seed >>>= 0;
    seed ^= seed << 5; seed >>>= 0;
    return seed;
  };
  for (let i = result.length - 1; i > 0; i -= 1) {
    const k = next() % (i + 1);
    [result[i], result[k]] = [result[k], result[i]];
  }
  return result;
}
const json = (value: Record<string, unknown>, status = 200, requestOrigin?: string, extra?: Record<string, string>) => {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'vary': 'Origin',
  });
  if (requestOrigin) headers.set('access-control-allow-origin', requestOrigin);
  for (const [key, value] of Object.entries(extra || {})) headers.set(key, value);
  return new Response(JSON.stringify(value), { status, headers });
};

async function auth(request: Request): Promise<User | null> {
  const authorization = request.headers.get('authorization');
  const cookie = request.headers.get('cookie');
  if (!authorization && !cookie) return null;

  const headers = new Headers();
  if (authorization?.match(/^Bearer\s+\S+$/i)) headers.set('authorization', authorization);
  else if (cookie) headers.set('cookie', cookie);
  else return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTASH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(new URL('/.netlify/identity/user', request.url), {
        headers,
        cache: 'no-store',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) return null;
    const user = await response.json() as User;
    return typeof user.id === 'string' && user.id.trim() ? user : null;
  } catch {
    return null;
  }
}

async function redis(command: unknown[]) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) throw new Error('Upstash is not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTASH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(UPSTASH_URL, {

    method: 'POST',
    headers: {
      authorization: `Bearer ${UPSTASH_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(command),
    signal: controller.signal,
  });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error('Upstash request failed');

  const payload = await response.json() as { result?: unknown; error?: unknown };
  if (payload.error) throw new Error(String(payload.error));
  return payload.result;
}

const safe = (value: string) => value.replace(/[^a-zA-Z0-9:._-]/g, '_');

async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const script = 'local n=redis.call("INCR",KEYS[1]); if n==1 then redis.call("EXPIRE",KEYS[1],ARGV[1]); end; return n';
  const count = await redis(['EVAL', script, '1', key, String(windowSeconds)]);
  return Number(count) <= limit;
}

function constantTimeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

async function sign(value: string, secret = SIGNING_KEYS.get(SIGNING_KEY_ID) || '') {
  if (!secret) throw new Error('Certificate signing is not configured');

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const canonical = (value: Omit<Cert, 'signature' | 'keyId'>, keyId = '') => [
  value.id,
  value.userId,
  value.name,
  value.score,
  value.total,
  value.percentage,
  value.issuedAt,
  value.version,
  keyId,
].join('|');

const publicCert = (value: Cert) => ({
  id: value.id,
  name: value.name,
  score: value.score,
  total: value.total,
  percentage: value.percentage,
  passed: true,
  issuedAt: value.issuedAt,
  version: value.version,
});

async function start(user: User, request: Request) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN || !SIGNING_KEYS.has(SIGNING_KEY_ID)) {
    return json({ error: 'The free verified exam is temporarily unavailable because persistence or signing is not configured.' }, 503);
  }

  const ip = safe((request.headers.get('x-nf-client-connection-ip') || '').trim().slice(0, 128));
  if (!ip) return json({ error: 'Unable to establish a trusted client identity.' }, 503);
  if (!(await rateLimit(`linuxterminal:rate:exam-start:ip:${ip}`, EXAM_RATE_LIMIT, EXAM_RATE_WINDOW_SECONDS))) return json({ error: 'Too many exam starts from this client. Please try again later.' }, 429);
  if (!(await rateLimit(`linuxterminal:rate:exam-start:user:${safe(String(user.id))}`, 5, 3600))) {
    return json({ error: 'Too many exam starts. Please try again later.' }, 429);
  }

  if (BANK.length < MIN_QUESTION_BANK_SIZE) return json({ error: 'The verified exam question bank is not sufficiently large.' }, 503);
  const selected = (await stableUserShuffle(BANK, String(user.id)))
    .slice(0, QUESTION_COUNT)
    .map((question) => ({ ...question, c: shuffle(question.c) }));
  const id = crypto.randomUUID();
  const attempt: Attempt = {
    userId: String(user.id),
    questions: selected,
    version: EXAM_VERSION,
    startedAt: new Date().toISOString(),
  };

  await redis(['SET', `linuxterminal:exam:attempt:${id}`, JSON.stringify(attempt), 'EX', ATTEMPT_TTL]);
  return json({
    attemptId: id,
    version: EXAM_VERSION,
    total: QUESTION_COUNT,
    passPercent: PASS_PERCENT,
    questions: selected.map(({ a, ...question }) => question),
  });
}

async function stableCertificateId(attemptId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(attemptId));
  const hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `LT-LNX-${new Date().getUTCFullYear()}-${hex.slice(0, 32)}`;
}

async function certificateIsDurablyRevoked(id: string): Promise<boolean> {
  if (!MONGODB_URI) return false;
  const collection = (await certificatesCollection()).db(MONGODB_DB).collection('certificate_revocations');
  if (!REVOCATION_INDEX_READY.has(collection)) {
    await collection.createIndex({ certificateId: 1 }, { unique: true, name: 'certificate_revocations_certificateId_unique' });
    REVOCATION_INDEX_READY.add(collection);
  }
  return Boolean(await collection.findOne({ certificateId: id }, { projection: { _id: 1 } }));
}

async function saveSubmissionResult(key: string, userId: string, response: Record<string, unknown>) {
  await redis(['SET', `${key}:result`, JSON.stringify({ userId, response } satisfies SubmissionResult), 'EX', ATTEMPT_TTL]);
}

async function submit(user: User, body: unknown, request: Request) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN || !SIGNING_KEYS.has(SIGNING_KEY_ID)) {
    return json({ error: 'Verified exam is not configured.' }, 503);
  }

  const ip = safe((request.headers.get('x-nf-client-connection-ip') || request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim().slice(0, 128));
  if (!ip) return json({ error: 'Unable to establish a trusted client identity.' }, 503);
  if (!(await rateLimit(`linuxterminal:rate:exam-submit:ip:${ip}`, EXAM_RATE_LIMIT, EXAM_RATE_WINDOW_SECONDS))) return json({ error: 'Too many exam submissions from this client. Please try again later.' }, 429);
  if (!(await rateLimit(`linuxterminal:rate:exam-submit:user:${safe(String(user.id))}`, 10, 3600))) {
    return json({ error: 'Too many exam submissions. Please try again later.' }, 429);
  }
  if (!body || typeof body !== 'object') return json({ error: 'Invalid request body.' }, 400);

  const value = body as { attemptId?: unknown; answers?: unknown };
  if (typeof value.attemptId !== 'string' || !Array.isArray(value.answers) || value.answers.length !== QUESTION_COUNT) {
    return json({ error: `Exactly ${QUESTION_COUNT} answers are required.` }, 400);
  }

  const key = `linuxterminal:exam:attempt:${safe(value.attemptId)}`;
  const lock = `${key}:lock`;
  if (await redis(['SET', lock, String(user.id), 'EX', 60, 'NX']) !== 'OK') {
    return json({ error: 'This attempt is already being submitted.' }, 409);
  }

  try {
    const existingResult = await redis(['GET', `${key}:result`]);
    if (typeof existingResult === 'string') {
      const saved = JSON.parse(existingResult) as SubmissionResult;
      if (saved.userId === String(user.id) && saved.response && typeof saved.response === 'object') return json(saved.response);
    }
    const raw = await redis(['GET', key]);
    if (typeof raw !== 'string') return json({ error: 'Exam attempt expired or was not found.' }, 404);

    const attempt = JSON.parse(raw) as Attempt;
    if (attempt.userId !== String(user.id) || attempt.version !== EXAM_VERSION) {
      return json({ error: 'Exam attempt does not belong to this account.' }, 403);
    }

    const questionIds = new Set(attempt.questions.map(question => question.id));
    if (questionIds.size !== QUESTION_COUNT) return json({ error: 'Stored exam attempt is invalid.' }, 500);
    const answers = new Map<string, number>();
    for (const item of value.answers) {
      if (!item || typeof item !== 'object') return json({ error: 'Invalid answer entry.' }, 400);
      const answer = item as { id?: unknown; choice?: unknown };
      if (typeof answer.id !== 'string' || !questionIds.has(answer.id) || !Number.isInteger(answer.choice) || answer.choice < 0 || answer.choice >= 4 || answers.has(answer.id)) {
        return json({ error: 'Each question must be answered exactly once with a valid choice.' }, 400);
      }
      answers.set(answer.id, answer.choice as number);
    }

    if (answers.size !== QUESTION_COUNT) {
      return json({ error: 'Every exam question must be answered exactly once.' }, 400);
    }

    let score = 0;
    for (const question of attempt.questions) {
      if (answers.get(question.id) === question.c.indexOf(question.a)) score += 1;
    }

    const percentage = Math.round(score / QUESTION_COUNT * 10000) / 100;
    if (percentage < PASS_PERCENT) {
      const response = {
        passed: false,
        score,
        total: QUESTION_COUNT,
        percentage,
        version: EXAM_VERSION,
        message: 'Not passed. Review the tutorials and retake the free assessment.',
      };
      await saveSubmissionResult(key, String(user.id), response);
      await redis(['DEL', key]);
      return json(response);
    }

    const issuedAt = new Date().toISOString();
    const name = typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim() ? user.user_metadata.full_name.trim().slice(0, 120) : 'LinuxTerminal learner';
    const id = await stableCertificateId(value.attemptId);
    const unsigned: Omit<Cert, 'signature'> = {
      id,
      userId: String(user.id),
      name: name || 'LinuxTerminal learner',
      score,
      total: QUESTION_COUNT,
      percentage,
      passed: true,
      issuedAt,
      version: EXAM_VERSION,
      keyId: SIGNING_KEY_ID,
    };
    const certificate: Cert = {
      ...unsigned,
      signature: await sign(canonical(unsigned, SIGNING_KEY_ID)),
      keyId: SIGNING_KEY_ID,
    };

    const collection = await certificatesCollection();
    const expiresAt = new Date(Date.now() + CERT_TTL * 1000);
    await collection.updateOne({ _id: id }, { $setOnInsert: { ...certificate, _id: id, userEmail: null, createdAt: new Date(issuedAt), expiresAt, attemptId: value.attemptId, audit: { issuedAt, source: 'assessment' } } }, { upsert: true });
    const stored = await collection.findOne({ _id: id }) as unknown as Cert | null;
    const response = { certificate: publicCert(stored || certificate), verificationPath: `/verify/?id=${encodeURIComponent(id)}` };
    await saveSubmissionResult(key, String(user.id), response);
    await redis(['DEL', key]);
    return json(response);
  } finally {
    await redis(['DEL', lock]).catch(() => {});
  }
}

async function verify(id: string, request: Request) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return json({ error: 'Certificate verification is temporarily unavailable.' }, 503, corsOrigin(request));
  {
    const client = safe((request.headers.get('x-nf-client-connection-ip') || '').trim().slice(0, 128));
    if (!client) return json({ error: 'Unable to establish a trusted client identity.' }, 503);
    if (!(await rateLimit(`linuxterminal:rate:certificate-verify:${client}`, VERIFY_RATE_LIMIT, VERIFY_RATE_WINDOW_SECONDS))) {
      return json({ error: 'Too many verification requests. Please try again later.' }, 429);
    }
  }
  if (!id || id.length > 80) return json({ error: 'A certificate ID is required.' }, 400);
  if (!/^[A-Z0-9:_-]+$/i.test(id)) return json({ error: 'Invalid certificate ID.' }, 400);

  const collection = await certificatesCollection();
  const certificate = await collection.findOne({ _id: id }) as unknown as Cert | null;
  if (!certificate) return json({ error: 'Certificate not found.' }, 404);
  if (REVOKED_CERTIFICATE_IDS.has(id) || await certificateIsDurablyRevoked(id)) return json({ error: 'Certificate has been revoked.' }, 410, corsOrigin(request));
  const { signature, keyId, ...unsigned } = certificate;
  const kid = typeof keyId === 'string' && keyId ? keyId : SIGNING_KEY_ID;
  const secret = SIGNING_KEYS.get(kid);
  if (!secret) return json({ error: 'Certificate signing key is unavailable.' }, 500);
  const expected = keyId ? await sign(canonical(unsigned, kid), secret) : await sign(canonical(unsigned), secret);
  const valid = constantTimeEqualHex(expected, signature);
  if (!valid) {
    return json({ error: 'Certificate signature verification failed.' }, 500);
  }
  const origin = corsOrigin(request);
  return json({ certificate: publicCert(certificate) }, 200, origin, { 'cache-control': 'no-store' });
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw new Error('content-type must be application/json');

  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
    throw new Error('request body is too large');
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_BODY_BYTES) throw new Error('request body is too large');
  return JSON.parse(new TextDecoder().decode(bytes));
}

export const config = { path: '/api/certificate' };

export default async (request: Request) => {
  if (request.method === 'OPTIONS') {
    const origin = corsOrigin(request);
    if (request.headers.get('origin') && !origin) return new Response('Origin not allowed.', { status: 403, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'vary': 'Origin' } });
    return new Response('', {
      status: 204,
      headers: {
        ...(origin ? { 'access-control-allow-origin': origin } : {}),
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type,authorization',
        'vary': 'Origin',
      },
    });
  }

  try {
    const url = new URL(request.url);
    if (request.method === 'GET') return verify(url.searchParams.get('id') || '', request);
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405, corsOrigin(request));

    const user = await auth(request);
    if (!user) return json({ error: 'Sign in to take the free verified exam.' }, 401);

    const action = url.searchParams.get('action');
    if (action !== 'start' && action !== 'submit') return json({ error: 'Unknown action.' }, 400);
    if (action === 'start') return start(user, request);

    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ error: message }, message === 'request body is too large' ? 413 : 400);
    }
    return submit(user, body, request);
  } catch (error) {
    console.error('Certificate service failed', error instanceof Error ? error.message : String(error));
    return json({ error: 'Certificate service unavailable.' }, 503);
  }
};

