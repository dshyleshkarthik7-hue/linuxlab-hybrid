import type { Config, Context } from "@netlify/edge-functions";

const WORKER = "https://linuxterminal-iso.dshyleshkarthik7.workers.dev/";
const ALLOWED_QUERY = new Set(["image", "chunkStart", "chunkEnd"]);

export default async (request: Request, _context: Context): Promise<Response> => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const incoming = new URL(request.url);
  const upstream = new URL(WORKER);
  upstream.searchParams.set("image", "linux4");
  for (const [key, value] of incoming.searchParams) {
    if (ALLOWED_QUERY.has(key) && key !== "image") upstream.searchParams.set(key, value);
  }
  const headers = new Headers();
  for (const name of ["accept", "range", "if-range"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(180_000),
    });
    const outputHeaders = new Headers(response.headers);
    outputHeaders.set("X-LinuxLab-Delivery", "netlify-edge-cloudflare-origin");
    outputHeaders.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: outputHeaders });
  } catch {
    return new Response("Linux 4 image delivery is temporarily unavailable. Please retry.", {
      status: 502,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8", "Retry-After": "10" },
    });
  }
};

export const config: Config = { path: "/api/iso/linux4" };
