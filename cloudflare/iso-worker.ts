const MAX_CHUNK_BYTES = 48 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 90_000;

const ALLOWED_ORIGIN = "https://linuxterminal.me";

const IMAGES = {
  developer: {
    url: "https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso",
    sha256:
      "9a4683039f356b6bdfa40897f1985b39d5a02e0f46d477e427e8262401301211",
    size: 691011584,
    filename: "alpine.iso",
  },

  virt: {
    url: "https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/V2.00/alpine-virt-3.24.1-x86.iso",
    sha256:
      "9895695d27eabc1e2782598ff0190f7966df8317cc2afe2a6d25360e148a4209",
    size: 51380224,
    filename: "alpine-virt-3.24.1-x86.iso",
  },

  linux4: {
    url: "https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v3.00/linux4.iso",
    sha256:
      "a8ea434ab3b177c55f01275dcc1d35f52cfbee9bd44a32e74765c975b58bcc73",
    size: 7731200,
    filename: "linux4.iso",
  },
} as const;

type ImageName = keyof typeof IMAGES;

function corsHeaders(): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers":
      "Range, If-Range, If-None-Match, If-Modified-Since",
    "Access-Control-Expose-Headers":
      "Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, X-LinuxLab-SHA256, X-LinuxLab-Chunk-Start, X-LinuxLab-Chunk-End, X-LinuxLab-Chunk-Total",
  });
}

function getImage(
  url: URL
): (typeof IMAGES)[ImageName] | null {
  const image = url.searchParams.get("image");

  if (
    image !== "developer" &&
    image !== "virt" &&
    image !== "linux4"
  ) {
    return null;
  }

  return IMAGES[image];
}

function getChunk(url: URL, size: number) {
  const rawStart = url.searchParams.get("chunkStart");
  const rawEnd = url.searchParams.get("chunkEnd");

  if (
    rawStart === null ||
    rawEnd === null ||
    !/^\d+$/.test(rawStart) ||
    !/^\d+$/.test(rawEnd)
  ) {
    throw new Error("chunkStart and chunkEnd are required");
  }

  const start = Number(rawStart);
  const requestedEnd = Number(rawEnd);

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    requestedEnd < start ||
    requestedEnd >= size ||
    start >= size
  ) {
    throw new Error("Invalid chunk boundary");
  }

  const end = requestedEnd;
  const length = end - start + 1;

  if (length > MAX_CHUNK_BYTES) {
    throw new Error("Chunk exceeds maximum size");
  }

  return {
    start,
    end,
  };
}

function errorResponse(
  message: string,
  status: number,
  headers: Headers
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");

  return new Response(message, {
    status,
    headers: responseHeaders,
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const headers = corsHeaders();

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers,
      });
    }

    if (
      request.method !== "GET" &&
      request.method !== "HEAD"
    ) {
      headers.set("Allow", "GET, HEAD, OPTIONS");

      return new Response("Method Not Allowed", {
        status: 405,
        headers,
      });
    }

    const image = getImage(url);

    if (!image) {
      return new Response(
        "Unknown image. Use image=developer, image=virt, or image=linux4.",
        {
          status: 404,
          headers,
        }
      );
    }

    let chunk;

    try {
      chunk = getChunk(url, image.size);
    } catch {
      headers.set(
        "Content-Range",
        `bytes */${image.size}`
      );

      return new Response("Invalid chunk", {
        status: 416,
        headers,
      });
    }

    const expectedLength =
      chunk.end - chunk.start + 1;

    const range =
      `bytes=${chunk.start}-${chunk.end}`;

    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      UPSTREAM_TIMEOUT_MS
    );

    try {
      const upstreamRequest = new Request(image.url, {
        method: "GET",
        headers: {
          Accept: "application/octet-stream",
          "User-Agent": "LinuxTerminal-ISO-Worker/1.0",
          "Accept-Encoding": "identity",
          Range: range,
        },
      });

      let upstream: Response;

      try {
        upstream = await fetch(upstreamRequest, {
          signal: controller.signal,
        });
      } catch {
        return errorResponse(
          "ISO origin temporarily unavailable",
          504,
          headers
        );
      }

      if (upstream.status !== 206) {
        return errorResponse(
          `ISO origin unavailable (${upstream.status})`,
          502,
          headers
        );
      }

      const contentRange =
        upstream.headers.get("content-range");

      const contentLength =
        upstream.headers.get("content-length");

      const expectedContentRange =
        `bytes ${chunk.start}-${chunk.end}/${image.size}`;

      if (
        contentRange !== expectedContentRange ||
        contentLength !== String(expectedLength)
      ) {
        return errorResponse(
          "ISO origin returned invalid chunk metadata",
          502,
          headers
        );
      }

      headers.set(
        "Cache-Control",
        "public, max-age=31536000, immutable"
      );

      headers.set(
        "Content-Type",
        upstream.headers.get("content-type") ||
          "application/octet-stream"
      );

      headers.set(
        "Content-Length",
        String(expectedLength)
      );

      headers.set("Accept-Ranges", "bytes");

      headers.set(
        "ETag",
        `"${image.sha256}-${chunk.start}-${chunk.end}"`
      );

      headers.set(
        "X-LinuxLab-SHA256",
        image.sha256
      );

      headers.set(
        "X-LinuxLab-Chunk-Start",
        String(chunk.start)
      );

      headers.set(
        "X-LinuxLab-Chunk-End",
        String(chunk.end)
      );

      headers.set(
        "X-LinuxLab-Chunk-Total",
        String(image.size)
      );

      headers.set(
        "Content-Range",
        contentRange
      );

      if (request.method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers,
        });
      }

      return new Response(upstream.body, {
        status: 206,
        headers,
      });
    } finally {
      clearTimeout(timeout);
    }
  },
};
