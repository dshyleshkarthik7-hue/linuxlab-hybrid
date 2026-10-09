import type { Config, Context } from "@netlify/edge-functions";

const ASSETS: Record<string, { size: number; sha256: string }> = {
  "seabios.bin": { size: 131072, sha256: "73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98" },
  "vgabios.bin": { size: 36352, sha256: "a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880" },
};

export default async (request: Request, _context: Context): Promise<Response> => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const url = new URL(request.url);
  const filename = url.searchParams.get("firmware") || "";
  const asset = ASSETS[filename];
  if (!asset) return new Response("Unknown firmware asset", { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const upstream = new URL("/" + filename, url.origin);
    const response = await fetch(upstream, { method: request.method, redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!response.ok) return new Response("Firmware asset unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
    const length = response.headers.get("content-length");
    if (length && Number(length) !== asset.size) return new Response("Firmware asset size mismatch", { status: 502, headers: { "Cache-Control": "no-store" } });
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("X-LinuxLab-SHA256", asset.sha256);
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return new Response("Firmware delivery is temporarily unavailable. Please retry.", { status: 502, headers: { "Cache-Control": "no-store", "Retry-After": "5" } });
  }
};

export const config: Config = { path: "/api/v86-firmware" };
