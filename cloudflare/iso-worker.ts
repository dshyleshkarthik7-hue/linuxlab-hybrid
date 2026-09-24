import manifest from '../artifacts/manifest.json' with { type: 'json' };

const MAX_CHUNK_BYTES = 48 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 30_000;
const WORKER_PROTOCOL_VERSION = "4";

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

    // Netlify preview deploys use the immutable deploy-id prefix. Support the
    // current site name (linuxterminalm) and the previous site name
    // (linuxterminal) while keeping the hostname allowlist scoped to Netlify.
    const isNetlifyPreview =
      /^([a-z0-9-]+)--linuxterminalm\.netlify\.app$/i.test(parsed.hostname) ||
      /^([a-z0-9-]+)--linuxterminal\.netlify\.app$/i.test(parsed.hostname);

    return isProductionOrigin || isNetlifyPreview;
  } catch {
    return false;
  }
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Cache-Control": "no-store",
    "CDN-Cache-Control": "no-store",
    "Access-Control-Allow-Headers": "Range, If-Range, If-None-Match, If-Modified-Since",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, X-LinuxLab-SHA256, X-LinuxLab-Chunk-Start, X-LinuxLab-Chunk-End, X-LinuxLab-Chunk-Total, X-LinuxLab-Artifact-Size, X-LinuxLab-Worker-Protocol",
  });
  const origin = request.headers.get("Origin");
  if (isAllowedOrigin(origin)) headers.set("Access-Control-Allow-Origin", origin!);
  return headers;
}

function getImage(url: URL): Image | null {
  const image = url.searchParams.get("image");
  if (image !== "developer" && image !== "virt" && image !== "linux4") return null;
  return IMAGES[image];
}

function getChunk(url: URL, size: number, rangeHeader?: string | null) {
  const rawStart = url.searchParams.get("chunkStart");
  const rawEnd = url.searchParams.get("chunkEnd");
  let startText = rawStart;
  let endText = rawEnd;
  if (startText === null || endText === null) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader || "");
    if (!match) throw new Error("chunkStart/chunkEnd or a single HTTP Range header is required");
    startText = match[1];
    endText = match[2] === "" ? String(size - 1) : match[2];
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

function errorResponse(message: string, status: number, headers: Headers): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set("CDN-Cache-Control", "no-store");
  return new Response(message, { status, headers: responseHeaders });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const headers = corsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "GET" && request.method !== "HEAD") {
      headers.set("Allow", "GET, HEAD, OPTIONS");
      return new Response("Method Not Allowed", { status: 405, headers });
    }
    const image = getImage(url);
    if (!image) return new Response("Unknown image. Use image=developer, image=virt, or image=linux4.", { status: 404, headers });
    let chunk;
    try { chunk = getChunk(url, image.size, request.headers.get("Range")); }
    catch {
      headers.set("Content-Range", `bytes */${image.size}`);
      return new Response("Invalid chunk", { status: 416, headers });
    }
    const expectedLength = chunk.end - chunk.start + 1;
    const range = `bytes=${chunk.start}-${chunk.end}`;
    try {
      let upstream: Response | null = null;
      const origins = [image.url, ...image.fallbacks].filter((candidate) => {
        try { return new URL(candidate).origin !== url.origin; } catch { return false; }
      });
      for (const origin of origins) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
        try {
          upstream = await fetch(new Request(origin, {
            method: "GET",
            headers: {
              Accept: "application/octet-stream",
              "User-Agent": "LinuxTerminal-ISO-Worker/3.0",
              "Accept-Encoding": "identity",
              Range: range,
            },
          }), { signal: controller.signal, cache: "no-store", redirect: "manual" });
          if (upstream.status === 206) break;
        } catch {
          if (controller.signal.aborted) continue;
        } finally {
          clearTimeout(timeout);
        }
      }
      if (!upstream) return errorResponse("ISO origin temporarily unavailable", 504, headers);
      if (upstream.status !== 206) return errorResponse(`ISO origin unavailable (${upstream.status})`, 502, headers);
      const contentRange = upstream.headers.get("content-range");
      const contentLength = upstream.headers.get("content-length");
      const expectedContentRange = `bytes ${chunk.start}-${chunk.end}/${image.size}`;
      if (contentRange !== expectedContentRange || contentLength !== String(expectedLength)) return errorResponse("ISO origin returned invalid chunk metadata", 502, headers);
      // CORS is origin-specific. Public edge caching by URL can otherwise replay a
      // response generated for linuxterminal.me to a Netlify Preview origin.
      // Keep the worker response private and let the browser manage its own range cache.
      headers.set("Cache-Control", "no-store");
      headers.set("CDN-Cache-Control", "no-store");
      headers.set("X-LinuxLab-SHA256", image.sha256);
      headers.set("X-LinuxLab-Artifact-Size", String(image.size));
      headers.set("X-LinuxLab-Worker-Protocol", WORKER_PROTOCOL_VERSION);
      headers.set("X-LinuxLab-Chunk-Start", String(chunk.start));
      headers.set("X-LinuxLab-Chunk-End", String(chunk.end));
      headers.set("X-LinuxLab-Chunk-Total", String(image.size));
      headers.set("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
      // The browser-side verifier requires the range contract on the worker response,
      // not only on the upstream response. Forward the already-validated Content-Range.
      headers.set("Content-Range", expectedContentRange);
      headers.set("Content-Length", String(expectedLength));
      headers.set("Accept-Ranges", "bytes");
      headers.set("ETag", `"${image.sha256}-${chunk.start}-${chunk.end}"`);
      return new Response(request.method === "HEAD" ? null : upstream.body, { status: 206, headers });
    } catch {
      return errorResponse("ISO origin temporarily unavailable", 504, headers);
    }
  },
};
