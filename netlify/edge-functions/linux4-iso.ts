import type { Config } from "@netlify/edge-functions";
import { LINUX4_ARTIFACT } from "../../src/core/artifacts.ts";

const UPSTREAMS = [LINUX4_ARTIFACT.url, ...(LINUX4_ARTIFACT.fallbackUrls ?? [])];
const TIMEOUT_MS = 30_000;

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  const range = request.headers.get("Range");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    for (const origin of UPSTREAMS) {
      try {
        const headers = new Headers({ Accept: "application/octet-stream" });
        if (range) headers.set("Range", range);
        const upstream = await fetch(origin, { method: "GET", redirect: "follow", cache: "no-store", headers, signal: controller.signal });
        if (upstream.status !== 200 && upstream.status !== 206) continue;
        const responseHeaders = new Headers(upstream.headers);
        responseHeaders.set("Cache-Control", "public, max-age=31536000, immutable");
        responseHeaders.set("Accept-Ranges", "bytes");
        responseHeaders.set("X-LinuxLab-SHA256", LINUX4_ARTIFACT.sha256);
        responseHeaders.set("X-LinuxLab-Artifact-Size", String(LINUX4_ARTIFACT.size));
        responseHeaders.set("X-LinuxLab-Source", origin);
        return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers: responseHeaders });
      } catch { if (controller.signal.aborted) break; }
    }
    return new Response("Linux4 ISO temporarily unavailable", { status: 502 });
  } finally { clearTimeout(timer); }
}
export const config: Config = { path: "/api/iso/linux4", cache: "manual" };
