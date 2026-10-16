const ASSETS: Record<string, { size: number; sha256: string }> = {
  "seabios.bin": { size: 131072, sha256: "73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98" },
  "vgabios.bin": { size: 36352, sha256: "a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880" },
};

export default async (request: Request): Promise<Response> => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const url = new URL(request.url);
  let filename = url.searchParams.get("firmware") || "";
  if (!filename) {
    const pathname = url.pathname.replace(/\/+$/, "");
    const parts = pathname.split("/");
    try {
      filename = decodeURIComponent(parts[parts.length - 1] || "");
    } catch {
      return new Response("Invalid firmware name", { status: 400, headers: { "Cache-Control": "no-store" } });
    }
  }
  const asset = ASSETS[filename];
  if (!asset) return new Response("Unknown firmware asset", { status: 404, headers: { "Cache-Control": "no-store" } });

  try {
    const upstream = new URL("/" + filename, url.origin);
    const response = await fetch(upstream, { method: "GET", redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!response.ok) return new Response("Firmware asset unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== asset.size) {
      return new Response("Firmware asset size mismatch", { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const actualHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (actualHash !== asset.sha256) {
      return new Response("Firmware asset integrity check failed", { status: 502, headers: { "Cache-Control": "no-store" } });
    }

    const headers = new Headers({
      "Content-Type": "application/octet-stream",
      "Content-Length": String(asset.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-LinuxLab-SHA256": asset.sha256,
      "X-Content-Type-Options": "nosniff",
    });
    return new Response(request.method === "HEAD" ? null : bytes, { status: 200, headers });
  } catch {
    return new Response("Firmware delivery is temporarily unavailable. Please retry.", { status: 502, headers: { "Cache-Control": "no-store", "Retry-After": "5" } });
  }
};
