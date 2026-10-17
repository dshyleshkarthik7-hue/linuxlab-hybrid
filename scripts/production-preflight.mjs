import { MongoClient, ServerApiVersion } from 'mongodb';

const PINNED_QWEN_MODEL = 'Qwen/Qwen3-8B@b968826d9c46dd6066d109eabc6255188de91218';
const required = ['MONGODB_URI', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'CERTIFICATE_SIGNING_KEYS', 'CERTIFICATE_SIGNING_KEY_ID', 'HF_TOKEN'];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error('Release preflight missing required environment variables:', missing.join(', '));
  process.exit(1);
}
if ((process.env.HF_MODEL || PINNED_QWEN_MODEL) !== PINNED_QWEN_MODEL) throw new Error('HF_MODEL must match the pinned Qwen revision exactly.');
const origins = new Set((process.env.CERTIFICATE_ALLOWED_ORIGINS || 'https://linuxterminal.me').split(',').map((x) => x.trim()).filter(Boolean));
if (!origins.has('https://linuxterminal.me')) throw new Error('CERTIFICATE_ALLOWED_ORIGINS must include https://linuxterminal.me.');

const signingKeys = new Map();
for (const item of process.env.CERTIFICATE_SIGNING_KEYS.split(',').map((x) => x.trim()).filter(Boolean)) {
  const i = item.indexOf('=');
  if (i > 0) signingKeys.set(item.slice(0, i), item.slice(i + 1));
}
const keyId = process.env.CERTIFICATE_SIGNING_KEY_ID;
if (!signingKeys.get(keyId) || signingKeys.get(keyId).length < 32) throw new Error('The active certificate signing key ID must resolve to a secret of at least 32 characters. Values are not printed.');

const redisUrl = process.env.UPSTASH_REDIS_REST_URL.replace(/\/$/, '');
const redisResponse = await fetch(redisUrl + '/ping', {
  headers: { authorization: 'Bearer ' + process.env.UPSTASH_REDIS_REST_TOKEN },
  signal: AbortSignal.timeout(5000),
  cache: 'no-store',
});
if (!redisResponse.ok) throw new Error('Upstash Redis ping failed with HTTP ' + redisResponse.status);
const redisPayload = await redisResponse.json();
if (redisPayload.result !== 'PONG') throw new Error('Upstash Redis did not return PONG.');

const mongo = new MongoClient(process.env.MONGODB_URI, {
  maxPoolSize: 2,
  serverSelectionTimeoutMS: 8000,
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});
try {
  await mongo.connect();
  const db = mongo.db(process.env.MONGODB_DB || 'linuxterminal');
  const certs = db.collection('certificates');
  const revocations = db.collection('certificate_revocations');
  await certs.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'certificates_expiresAt_ttl' });
  await revocations.createIndex({ certificateId: 1 }, { unique: true, name: 'certificate_revocations_certificateId_unique' });
  const [certIndexes, revocationIndexes] = await Promise.all([certs.listIndexes().toArray(), revocations.listIndexes().toArray()]);
  if (!certIndexes.some((index) => index.name === 'certificates_expiresAt_ttl' && index.expireAfterSeconds === 0)) throw new Error('Certificate TTL index is missing or misconfigured.');
  if (!revocationIndexes.some((index) => index.name === 'certificate_revocations_certificateId_unique' && index.unique === true)) throw new Error('Certificate revocation unique index is missing or misconfigured.');
  console.log('MongoDB connected; certificate TTL and durable revocation indexes verified.');
} finally {
  await mongo.close();
}

const modelResponse = await fetch('https://router.huggingface.co/v1/chat/completions', {
  method: 'POST',
  headers: { authorization: 'Bearer ' + process.env.HF_TOKEN, 'content-type': 'application/json' },
  body: JSON.stringify({ model: PINNED_QWEN_MODEL, messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 2, temperature: 0 }),
  signal: AbortSignal.timeout(20000),
  cache: 'no-store',
});
if (!modelResponse.ok) {
  const detail = (await modelResponse.text()).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 300);
  throw new Error('Hugging Face Router rejected the pinned model (HTTP ' + modelResponse.status + '): ' + detail);
}
const modelPayload = await modelResponse.json();
if (!modelPayload.choices?.[0]?.message?.content) throw new Error('Hugging Face Router returned no model completion.');
console.log('Hugging Face Router accepted the pinned Qwen revision and returned a completion.');
console.log('Release preflight passed. No secret values were printed.');
