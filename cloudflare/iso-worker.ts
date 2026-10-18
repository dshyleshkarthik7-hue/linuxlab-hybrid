import manifest from '../artifacts/manifest.json' with { type: 'json' };
import developerChunkManifest from '../artifacts/developer-alpine-chunks.json' with { type: 'json' };

const MAX_CHUNK_BYTES = 32 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 90_000;
const WORKER_PROTOCOL_VERSION = "7";
const HUGGINGFACE_BUCKET_ORIGIN = "https://huggingface.co/buckets/";
const ISO_CACHE_TTL = 31536000;
const MAX_FULL_UPSTREAM_BYTES = 64 * 1024 * 1024;
