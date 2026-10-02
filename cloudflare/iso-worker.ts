import manifest from '../artifacts/manifest.json' with { type: 'json' };

const MAX_CHUNK_BYTES = 32 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 30_000;
const WORKER_PROTOCOL_VERSION = "7";
const HUGGINGFACE_BUCKET_ORIGIN = "https://huggingface.co/buckets/";
const ISO_CACHE_TTL = 31536000;
const MAX_FULL_UPSTREAM_BYTES = 64 * 1024 * 1024;

function isTrustedUpstream(value: string): boolean {
  try { const url = new URL(value); if (url.protocol !== "https:") return false; return url.hostname === "huggingface.co" || url.hostname.endsWith(".hf.co") || url.hostname === "github.com" || url.hostname === "api.github.com" || url.hostname === "objects.githubusercontent.com" || url.hostname === "release-assets.githubusercontent.com"; } catch { return false; }
}


type ManifestArtifact = typeof manifest.artifacts[number] & { image?: string; fallbackUrls?: string[] };
type Image = { url: string; sha256: string; size: number; filename: string; fallbacks: string[] };
const isoEntries = (manifest.artifacts as ManifestArtifact[]).filter((artifact) => artifact.image);
const IMAGES = Object.fromEntries(
  isoEntries.map((artifact) => [artifact.image, {
    url: artifact.url,
    sha256: artifact.sha256,
    size: artifact.size,
    filename: artifact.filename,
    fallbacks: artifact.fallbackUrls ?? [],
  }]),
) as Record<'developer' | 'virt' | 'linux4', Image>;

type ImageName = keyof typeof IMAGES;

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:") return false;

    const isProductionOrigin =
      parsed.origin === "https://linuxterminal.me" ||
      parsed.origin === "https://www.linuxterminal.me";

    const isLocalDevelopmentOrigin =
      parsed.origin === "http://127.0.0.1:4173" ||
      parsed.origin === "http://127.0.0.1:4174" ||
      parsed.origin === "http://localhost:4173" ||
      parsed.origin === "http://localhost:4174";

    // Netlify preview deploys use the immutable deploy-id prefix. Support the
    // current site name (linuxterminalm) and the previous site name
    // (linuxterminal) while keeping the hostname allowlist scoped to Netlify.
    const isNetlifyPreview =
      /^([a-z0-9-]+)--linuxterminalm\.netlify\.app$/i.test(parsed.hostname) ||
      /^([a-z0-9-]+)--linuxterminal\.netlify\.app$/i.test(parsed.hostname);

    return isProductionOrigin || isLocalDevelopmentOrigin || isNetlifyPreview;
  } catch {
    return false;
  }
}

interface RateLimitBinding { limit(input: { key: string }): Promise<{ success: boolean }>; }
interface Env { ISO_RATE_LIMITER: RateLimitBinding; }

function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Cache-Control": "public, max-age=31536000, immutable",
    "CDN-Cache-Control": "public, max-age=31536000, immutable",
    "Access-Control-Allow-Headers": "Range, If-Range, If-None-Match, If-Modified-Since",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, X-LinuxLab-SHA256, X-LinuxLab-Chunk-Start, X-LinuxLab-Chunk-End, X-LinuxLab-Chunk-Total, X-LinuxLab-Artifact-Size, X-LinuxLab-Worker-Protocol",
  });
  const origin = request.headers.get("Origin");
  if (isAllowedOrigin(origin)) headers.set("Access-Control-Allow-Origin", origin!);
  return headers;
}

function getImage(url: URL): Image | null {
  const image = url.searchParams.get("image");
  if (image === "developer" || image === "virt" || image === "linux4") return IMAGES[image];
  const partMatch = /^\/(developer|virt|linux4)-(\d+)-(\d+)-([a-f0-9]{64})$/.exec(url.pathname);
  if (partMatch) {
    const image = IMAGES[partMatch[1] as ImageName];
    return image && partMatch[4] === image.sha256 ? image : null;
  }
  return null;
}

function pathPart(url: URL): { start: number; end: number } | null {
  const match = /^\/(?:developer|virt|linux4)-(\d+)-(\d+)-([a-f0-9]{64})$/.exec(url.pathname);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
  return { start, end };
}

function queryRange(url: URL): { start: string | null; end: string | null } {
  return {
    start: url.searchParams.get("chunkStart"),
    end: url.searchParams.get("chunkEnd"),
  };
}

function getChunk(url: URL, size: number, rangeHeader?: string | null) {
  const { start: rawStart, end: rawEnd } = queryRange(url);
  const rangeMatch = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader || "");
  if ((rawStart !== null) !== (rawEnd !== null)) throw new Error("Both chunkStart and chunkEnd are required");
  if (rawStart !== null && rawEnd !== null && rangeMatch) {
    const queryStart = Number(rawStart);
    const queryEnd = rawEnd === "" ? size - 1 : Number(rawEnd);
    const headerStart = Number(rangeMatch[1]);
    const headerEnd = rangeMatch[2] === "" ? size - 1 : Number(rangeMatch[2]);
    if (queryStart !== headerStart || queryEnd !== headerEnd) throw new Error("Conflicting range parameters");
  }
  let startText = rawStart;
  let endText = rawEnd;
  if (startText === null || endText === null) {
    if (!rangeMatch) throw new Error("chunkStart/chunkEnd or a single HTTP Range header is required");
    startText = rangeMatch[1];
    endText = rangeMatch[2] === "" ? String(size - 1) : rangeMatch[2];
  }
  if (!/^\d+$/.test(startText) || !/^\d+$/.test(endText)) throw new Error("Invalid chunk boundary");
  const start = Number(startText);
  const requestedEnd = Number(endText);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || requestedEnd < start || requestedEnd >= size || start >= size) throw new Error("Invalid chunk boundary");
  const end = requestedEnd;
  const length = end - start + 1;
  if (length > MAX_CHUNK_BYTES) throw new Error("Chunk exceeds maximum size");
  return { start, end };
}

function cacheKey(request: Request, origin: string, chunk: { start: number; end: number }): Request {
  const url = new URL(request.url);
  // Normalize both query and HTTP Range requests to the same immutable chunk key.
  // This prevents two different Range headers from colliding in Cloudflare cache.
  url.searchParams.set("chunkStart", String(chunk.start));
  url.searchParams.set("chunkEnd", String(chunk.end));
  url.searchParams.set("__cors_origin", origin);
  return new Request(url.toString(), { method: "GET" });
}

function errorResponse(message: string, status: number, headers: Headers): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  responseHeaders.set("CDN-Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return new Response(message, { status, headers: responseHeaders });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const headers = corsHeaders(request);
    const origin = request.headers.get("Origin");
    if (!isAllowedOrigin(origin)) return new Response("Origin not allowed", { status: 403, headers });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "GET" && request.method !== "HEAD") {
      headers.set("Allow", "GET, HEAD, OPTIONS");
      return new Response("Method Not Allowed", { status: 405, headers });
    }
    const image = getImage(url);
    if (!image) return new Response("Unknown image. Use image=developer, image=virt, or image=linux4.", { status: 404, headers });
    let chunk;
    try {
      const part = pathPart(url);
      chunk = part ? getChunk(new URL(url), image.size, `bytes=${part.start}-${part.end}`) : getChunk(url, image.size, request.headers.get("Range"));
    }
    catch {
      headers.set("Content-Range", `bytes */${image.size}`);
      return new Response("Invalid chunk", { status: 416, headers });
    }
    const expectedLength = chunk.end - chunk.start + 1;
    const range = `bytes=${chunk.start}-${chunk.end}`;
    const originKey = origin!;
    const key = cacheKey(request, originKey, chunk);
    const cache = caches.default;
    const cached = await cache.match(key);
    if (cached) return cached;
    const clientKey = request.headers.get("CF-Connecting-IP") || "unknown";
    if (!env?.ISO_RATE_LIMITER || typeof env.ISO_RATE_LIMITER.limit !== "function") {
      return errorResponse("ISO rate limiting is not configured", 503, headers);
    }
    let rate: { success: boolean };
    try {
      rate = await env.ISO_RATE_LIMITER.limit({ key: clientKey });
    } catch {
      return errorResponse("ISO rate limiting is temporarily unavailable", 503, headers);
    }
    if (!rate.success) return errorResponse("ISO rate limit exceeded", 429, headers);
    try {
      const origins = [...image.fallbacks, image.url].filter((candidate) => {
        try { return new URL(candidate).origin !== url.origin; } catch { return false; }
      });
      // Start every trusted origin concurrently, but resolve as soon as the first
      // validated response is available. Promise.all() would still wait for every
      // slow/failed origin, defeating the timeout isolation this fallback needs.
      const upstreamCandidates = origins.map(async (origin) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
        try {
          const candidate = new URL(origin);
          if (!isTrustedUpstream(candidate.href) || candidate.origin === url.origin) throw new Error("Untrusted ISO origin");
          const response = await fetch(new Request(candidate.href, {
            method: "GET",
            headers: { Accept: "application/octet-stream", "User-Agent": "LinuxTerminal-ISO-Worker/5.0", "Accept-Encoding": "identity", Range: range },
          }), { signal: controller.signal, cache: "default", redirect: "follow" });
          if (!isTrustedUpstream(response.url) || new URL(response.url).origin === url.origin) {
            response.body?.cancel();
            throw new Error("Untrusted ISO redirect target");
          }
          if (response.status === 206) return response;
          if (response.status === 200 && image.size <= MAX_FULL_UPSTREAM_BYTES) return response;
          response.body?.cancel();
          throw new Error(`ISO origin returned status ${response.status}`);
        } finally {
          clearTimeout(timeout);
        }
      });
      // Fallbacks are raced concurrently so one slow/unreachable CDN cannot consume
      // the Worker execution window before a healthy origin is attempted.
      const upstream = await Promise.any(upstreamCandidates).catch(() => null);
      if (!upstream) return errorResponse("ISO origin temporarily unavailable", 504, headers);
      const contentRange = upstream.headers.get("content-range");
      const contentLength = upstream.headers.get("content-length");
      const expectedContentRange = `bytes ${chunk.start}-${chunk.end}/${image.size}`;
      let body: ReadableStream<Uint8Array> | null = upstream.body;
      if (upstream.status === 206) {
        if (contentRange !== expectedContentRange || contentLength !== String(expectedLength)) return errorResponse("ISO origin returned invalid chunk metadata", 502, headers);
      } else if (upstream.status === 200 && image.size <= MAX_FULL_UPSTREAM_BYTES) {
        const fullBody = new Uint8Array(await upstream.arrayBuffer());
        if (fullBody.byteLength !== image.size) return errorResponse("ISO origin returned invalid artifact length", 502, headers);
        body = new Blob([fullBody.slice(chunk.start, chunk.end + 1)]).stream();
      } else {
        return errorResponse(`ISO origin unavailable (${upstream.status})`, 502, headers);
      }
      // Each chunk URL is immutable because its coordinates and artifact digest are
      // part of the request contract. Return the chunk as a standalone 200 object so
      // Cloudflare can cache it without having to cache a 206 Range response.
      // CORS varies by Origin, so the cache key is explicitly varied by Origin below.
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      headers.set("CDN-Cache-Control", "public, max-age=31536000, immutable");
      headers.set("Vary", "Origin");
      headers.set("X-LinuxLab-SHA256", image.sha256);
      headers.set("X-LinuxLab-Artifact-Size", String(image.size));
      headers.set("X-LinuxLab-Worker-Protocol", WORKER_PROTOCOL_VERSION);
      headers.set("X-LinuxLab-Chunk-Start", String(chunk.start));
      headers.set("X-LinuxLab-Chunk-End", String(chunk.end));
      headers.set("X-LinuxLab-Chunk-Total", String(image.size));
      headers.set("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
      // The browser-side verifier requires the range contract on the worker response,
      // not only on the upstream response. Forward the already-validated Content-Range.
      headers.set("Content-Length", String(expectedLength));
      headers.set("Content-Range", expectedContentRange);
      headers.set("Accept-Ranges", "bytes");
      headers.set("ETag", `"${image.sha256}-${chunk.start}-${chunk.end}"`);
      const response = new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
      if (request.method === "GET") {
        const cacheable = response.clone();
        ctx.waitUntil(cache.put(key, cacheable));
      }
      return response;
    } catch {
      return errorResponse("ISO origin temporarily unavailable", 504, headers);
    }
  },
};
