import { MongoClient, ServerApiVersion } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'linuxlab';
let mongoPromise: Promise<MongoClient> | null = null;
async function certificatesCollection() {
  if (!MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  if (!mongoPromise) mongoPromise = new MongoClient(MONGODB_URI, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000, serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true } }).connect().catch(error => { mongoPromise = null; throw error; });
  return (await mongoPromise).db(MONGODB_DB).collection('certificates');
}

const EXAM_VERSION = 'linux-foundations-1.0';
const QUESTION_COUNT = 30;
const PASS_PERCENT = 80;
const ATTEMPT_TTL = 3600;
const VERIFY_RATE_LIMIT = 60;
const VERIFY_RATE_WINDOW_SECONDS = 60;
const CERT_TTL = 60 * 60 * 24 * 365 * 5;
const MAX_BODY_BYTES = 16384;
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const SIGNING_SECRET = process.env.CERTIFICATE_SIGNING_SECRET;
const SIGNING_KEY_ID = process.env.CERTIFICATE_SIGNING_KEY_ID || 'current';
const SIGNING_KEYS = (() => { const map = new Map<string, string>(); if (SIGNING_SECRET) map.set(SIGNING_KEY_ID, SIGNING_SECRET); for (const item of (process.env.CERTIFICATE_SIGNING_KEYS || '').split(',').map(x=>x.trim()).filter(Boolean)) { const i=item.indexOf('='); if(i>0) map.set(item.slice(0,i),item.slice(i+1)); } return map; })();
const ALLOWED_ORIGINS = new Set((process.env.TUTOR_ALLOWED_ORIGINS || 'https://linuxterminal.me').split(',').map(value => value.trim()).filter(Boolean));
const corsOrigin = (request: Request) => { const origin = request.headers.get('origin'); return origin && ALLOWED_ORIGINS.has(origin) ? origin : [...ALLOWED_ORIGINS][0] || 'https://linuxterminal.me'; };

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

const BANK: Q[] = [
  {
    id: 'pwd',
    q: 'Which command prints the current working directory?',
    c: ['pwd', 'cd', 'ls', 'whoami'],
    a: 'pwd',
    t: 'navigation',
  },
  {
    id: 'ls',
    q: 'Which ls form commonly includes hidden entries and long metadata?',
    c: ['ls -la', 'ls -r', 'ls -p', 'ls -n'],
    a: 'ls -la',
    t: 'files',
  },
  {
    id: 'cd',
    q: 'What does cd .. normally do?',
    c: ['moves to the parent directory', 'prints the parent directory', 'removes the parent', 'copies the parent'],
    a: 'moves to the parent directory',
    t: 'navigation',
  },
  {
    id: 'mkdir',
    q: 'What does mkdir -p add?',
    c: ['creates missing parent directories', 'prints permissions', 'removes parents', 'compresses directories'],
    a: 'creates missing parent directories',
    t: 'files',
  },
  {
    id: 'cat',
    q: 'What does cat notes.txt normally write to stdout?',
    c: ['the file contents', 'only permissions', 'the username', 'only the size'],
    a: 'the file contents',
    t: 'files',
  },
  {
    id: 'cp',
    q: 'Which command copies report.txt to backup.txt?',
    c: ['cp report.txt backup.txt', 'mv report.txt backup.txt', 'ln report.txt backup.txt', 'cat report.txt backup.txt'],
    a: 'cp report.txt backup.txt',
    t: 'files',
  },
  {
    id: 'mv',
    q: 'What is a common use of mv?',
    c: ['move or rename a path', 'show processes', 'search text', 'change permissions'],
    a: 'move or rename a path',
    t: 'files',
  },
  {
    id: 'rm',
    q: 'Which flag is commonly needed to remove a directory tree?',
    c: ['-r', '-l', '-n', '-p'],
    a: '-r',
    t: 'files',
  },
  {
    id: 'find',
    q: 'Which find test restricts matches to regular files?',
    c: ['-type f', '-kind file', '-regular', '-file'],
    a: '-type f',
    t: 'search',
  },
  {
    id: 'grep',
    q: 'What does grep -n add to matching lines?',
    c: ['line numbers', 'permissions', 'timestamps', 'network addresses'],
    a: 'line numbers',
    t: 'text',
  },
  {
    id: 'head',
    q: 'What does head -n 5 request?',
    c: ['the first five lines', 'the last five lines', 'five matching lines', 'five bytes'],
    a: 'the first five lines',
    t: 'text',
  },
  {
    id: 'tail',
    q: 'What does tail -n 20 request?',
    c: ['the last twenty lines', 'the first twenty lines', 'twenty words', 'twenty files'],
    a: 'the last twenty lines',
    t: 'text',
  },
  {
    id: 'wc',
    q: 'Which wc option counts lines?',
    c: ['-l', '-c', '-w', '-m'],
    a: '-l',
    t: 'text',
  },
  {
    id: 'sort',
    q: 'What does sort -n change?',
    c: ['numeric comparison', 'duplicate removal', 'reverse filesystem', 'word counting'],
    a: 'numeric comparison',
    t: 'text',
  },
  {
    id: 'uniq',
    q: 'Why is sort often before uniq for arbitrary text?',
    c: ['uniq compares adjacent duplicates', 'sort encrypts input', 'uniq accepts only numbers', 'the shell requires sort'],
    a: 'uniq compares adjacent duplicates',
    t: 'text',
  },
  {
    id: 'sed',
    q: 'What does sed s/old/new/g represent?',
    c: ['a substitution on input lines', 'a permission change', 'a process search', 'a network request'],
    a: 'a substitution on input lines',
    t: 'text',
  },
  {
    id: 'awk',
    q: 'What does $1 normally mean in awk?',
    c: ['the first field of the current record', 'the shell PID', 'the first shell argument', 'the first output file'],
    a: 'the first field of the current record',
    t: 'text',
  },
  {
    id: 'chmod',
    q: 'What does chmod change?',
    c: ['file permission bits', 'file contents', 'the current directory', 'the kernel version'],
    a: 'file permission bits',
    t: 'permissions',
  },
  {
    id: 'whoami',
    q: 'What does whoami report?',
    c: ['the effective username', 'all users', 'the hostname only', 'the current directory'],
    a: 'the effective username',
    t: 'users',
  },
  {
    id: 'ps',
    q: 'What does ps normally provide?',
    c: ['a process snapshot', 'an archive', 'an editor', 'a packet capture'],
    a: 'a process snapshot',
    t: 'processes',
  },
  {
    id: 'df',
    q: 'Which tool reports filesystem capacity and available space?',
    c: ['df', 'du', 'free', 'wc'],
    a: 'df',
    t: 'storage',
  },
  {
    id: 'du',
    q: 'Which tool estimates directory-tree space usage?',
    c: ['du', 'df', 'free', 'ps'],
    a: 'du',
    t: 'storage',
  },
  {
    id: 'free',
    q: 'What does free report?',
    c: ['memory and swap statistics', 'filesystem capacity', 'process IDs', 'network routes'],
    a: 'memory and swap statistics',
    t: 'system',
  },
  {
    id: 'uname',
    q: 'Which command shows kernel/system identification?',
    c: ['uname', 'whoami', 'date', 'env'],
    a: 'uname',
    t: 'system',
  },
  {
    id: 'tar',
    q: 'Which tar operation creates an archive?',
    c: ['-c', '-x', '-t', '-p'],
    a: '-c',
    t: 'archives',
  },
  {
    id: 'gzip',
    q: 'What is gzip primarily for?',
    c: ['compression', 'encryption', 'filesystem repair', 'process scheduling'],
    a: 'compression',
    t: 'archives',
  },
  {
    id: 'curl',
    q: 'What does curl -I commonly request?',
    c: ['HTTP response headers', 'a local file listing', 'an SSH key', 'a mount'],
    a: 'HTTP response headers',
    t: 'network',
  },
  {
    id: 'ip',
    q: 'Which command commonly inspects Linux interface addresses?',
    c: ['ip addr', 'ifconfig only', 'routefile', 'netstat-file'],
    a: 'ip addr',
    t: 'network',
  },
  {
    id: 'gcc',
    q: 'What does gcc -o app main.c do when compilation succeeds?',
    c: ['builds a C executable named app', 'opens the source', 'compresses it', 'runs ping'],
    a: 'builds a C executable named app',
    t: 'development',
  },
  {
    id: 'make',
    q: 'What does make primarily use to decide what to build?',
    c: ['Makefile rules and dependencies', 'the username', 'the browser URL', 'terminal color'],
    a: 'Makefile rules and dependencies',
    t: 'development',
  },
  {
    id: 'pipe',
    q: 'What does grep ERROR app.log | wc -l demonstrate?',
    c: ['sending grep stdout into wc', 'copying the file', 'running commands independently', 'redirecting stderr'],
    a: 'sending grep stdout into wc',
    t: 'shell',
  },
  {
    id: 'redirect',
    q: 'What does > normally do?',
    c: ['redirect stdout and replace the destination', 'append stdout', 'redirect stderr only', 'create a pipeline'],
    a: 'redirect stdout and replace the destination',
    t: 'shell',
  },
  {
    id: 'append',
    q: 'What does >> normally do?',
    c: ['append stdout to a file', 'replace stdout with stderr', 'create a pipeline', 'change permissions'],
    a: 'append stdout to a file',
    t: 'shell',
  },
  {
    id: 'status',
    q: 'What does a non-zero exit status normally indicate?',
    c: ['failure or a false condition', 'successful output', 'root execution', 'directory change'],
    a: 'failure or a false condition',
    t: 'shell',
  },
  {
    id: 'export',
    q: 'What is export mainly used for?',
    c: ['make a variable available to child processes', 'compress a variable', 'delete a variable', 'show disk usage'],
    a: 'make a variable available to child processes',
    t: 'shell',
  },
  {
    id: 'ssh',
    q: 'What does SSH provide for a remote shell?',
    c: ['encrypted transport and authentication', 'compression only', 'a local editor', 'a compiler'],
    a: 'encrypted transport and authentication',
    t: 'network',
  },
  {
    id: 'ping',
    q: 'What does ping test?',
    c: ['ICMP echo reachability and timing', 'all TCP ports', 'disk capacity', 'file permissions'],
    a: 'ICMP echo reachability and timing',
    t: 'network',
  },
  {
    id: 'cut',
    q: 'Which cut options commonly select delimiter-separated fields?',
    c: ['-d and -f', '-n and -r', '-x and -z', '-p and -q'],
    a: '-d and -f',
    t: 'text',
  },
];

function shuffle<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const j = random[0] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const json = (value: Record<string, unknown>, status = 200, requestOrigin = 'https://linuxterminal.me') => new Response(JSON.stringify(value), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'access-control-allow-origin': requestOrigin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
  },
});

async function auth(request: Request): Promise<User | null> {
  const authorization = request.headers.get('authorization');
  const cookie = request.headers.get('cookie');
  if (!authorization && !cookie) return null;

  const headers = new Headers();
  if (authorization?.match(/^Bearer\s+\S+$/i)) headers.set('authorization', authorization);
  else if (cookie) headers.set('cookie', cookie);
  else return null;

  try {
    const response = await fetch(new URL('/.netlify/identity/user', request.url), {
      headers,
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const user = await response.json() as User;
    return typeof user.id === 'string' && user.id.trim() ? user : null;
  } catch {
    return null;
  }
}

async function redis(command: unknown[]) {
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

async function sign(value: string, secret = SIGNING_SECRET || '') {
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

async function start(user: User) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN || !SIGNING_SECRET) {
    return json({ error: 'The free verified exam is temporarily unavailable because persistence or signing is not configured.' }, 503);
  }

  if (!(await rateLimit(`linuxterminal:rate:exam-start:${safe(String(user.id))}`, 5, 3600))) {
    return json({ error: 'Too many exam starts. Please try again later.' }, 429);
  }

  const selected = shuffle(BANK)
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

async function submit(user: User, body: unknown) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN || !SIGNING_SECRET) {
    return json({ error: 'Verified exam is not configured.' }, 503);
  }

  if (!(await rateLimit(`linuxterminal:rate:exam-submit:${safe(String(user.id))}`, 10, 3600))) {
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
    const raw = await redis(['GET', key]);
    if (typeof raw !== 'string') return json({ error: 'Exam attempt expired or was not found.' }, 404);

    const attempt = JSON.parse(raw) as Attempt;
    if (attempt.userId !== String(user.id) || attempt.version !== EXAM_VERSION) {
      return json({ error: 'Exam attempt does not belong to this account.' }, 403);
    }

    const answers = new Map<string, number>();
    for (const item of value.answers) {
      if (!item || typeof item !== 'object') return json({ error: 'Invalid answer entry.' }, 400);
      const answer = item as { id?: unknown; choice?: unknown };
      if (typeof answer.id !== 'string' || !Number.isInteger(answer.choice) || answers.has(answer.id)) {
        return json({ error: 'Each question must be answered exactly once.' }, 400);
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
      await redis(['DEL', key]);
      return json({
        passed: false,
        score,
        total: QUESTION_COUNT,
        percentage,
        version: EXAM_VERSION,
        message: 'Not passed. Review the tutorials and retake the free assessment.',
      });
    }

    const issuedAt = new Date().toISOString();
    const name = typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim() ? user.user_metadata.full_name.trim().slice(0, 120) : 'LinuxTerminal learner';
    const id = `LT-LNX-${new Date().getUTCFullYear()}-${crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
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
    await collection.updateOne({ _id: id }, { $set: { ...certificate, _id: id, userEmail: null, createdAt: new Date(issuedAt) } }, { upsert: true });
    await redis(['DEL', key]);
    return json({
      certificate: publicCert(certificate),
      verificationPath: `/verify/?id=${encodeURIComponent(id)}`,
    });
  } finally {
    await redis(['DEL', lock]).catch(() => {});
  }
}

async function verify(id: string, request: Request) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return json({ error: 'Certificate verification is temporarily unavailable.' }, 503, corsOrigin(request));
  {
    const forwarded = request.headers.get('x-nf-client-connection-ip') || request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const client = safe(forwarded.trim().slice(0, 128));
    if (!(await rateLimit(`linuxterminal:rate:certificate-verify:${client}`, VERIFY_RATE_LIMIT, VERIFY_RATE_WINDOW_SECONDS))) {
      return json({ error: 'Too many verification requests. Please try again later.' }, 429);
    }
  }
  if (!id || id.length > 80) return json({ error: 'A certificate ID is required.' }, 400);
  if (!/^[A-Z0-9:_-]+$/i.test(id)) return json({ error: 'Invalid certificate ID.' }, 400);

  const collection = await certificatesCollection();
  const certificate = await collection.findOne({ _id: id }) as unknown as Cert | null;
  if (!certificate) return json({ error: 'Certificate not found.' }, 404);
  const { signature, keyId, ...unsigned } = certificate;
  const kid = typeof keyId === 'string' && keyId ? keyId : SIGNING_KEY_ID;
  const secret = SIGNING_KEYS.get(kid);
  if (!secret) return json({ error: 'Certificate signing key is unavailable.' }, 500);
  const expected = keyId ? await sign(canonical(unsigned, kid), secret) : await sign(canonical(unsigned), secret);
  const valid = constantTimeEqualHex(expected, signature);
  if (!valid) {
    return json({ error: 'Certificate signature verification failed.' }, 500);
  }
  return json({ certificate: publicCert(certificate) });
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
    return new Response('', {
      status: 204,
      headers: {
        'access-control-allow-origin': corsOrigin(request),
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type,authorization',
      },
    });
  }

  try {
    const url = new URL(request.url);
    if (request.method === 'GET') return verify(url.searchParams.get('id') || '', request);
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

    const user = await auth(request);
    if (!user) return json({ error: 'Sign in to take the free verified exam.' }, 401);

    const action = url.searchParams.get('action');
    if (action !== 'start' && action !== 'submit') return json({ error: 'Unknown action.' }, 400);
    if (action === 'start') return start(user);

    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ error: message }, message === 'request body is too large' ? 413 : 400);
    }
    return submit(user, body);
  } catch (error) {
    console.error('Certificate service failed', error instanceof Error ? error.message : String(error));
    return json({ error: 'Certificate service unavailable.' }, 503);
  }
};

