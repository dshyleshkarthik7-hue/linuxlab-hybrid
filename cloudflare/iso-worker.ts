import manifest from '../artifacts/manifest.json' with { type: 'json' };
import developerChunkManifest from '../artifacts/developer-alpine-chunks.json' with { type: 'json' };

const MAX_CHUNK_BYTES = 32 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 90_000;
const WORKER_PROTOCOL_VERSION = "7";
const HUGGINGFACE_BUCKET_ORIGIN = "https://huggingface.co/buckets/";
const ISO_CACHE_TTL = 31536000;
const MAX_FULL_UPSTREAM_BYTES = 64 * 1024 * 1024;

function isTrustedUpstream(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    return (
      hostname === "huggingface.co" ||
      hostname.endsWith(".huggingface.co") ||
      hostname === "hf.co" ||
      hostname.endsWith(".hf.co") ||
      hostname === "xethub.hf.co" ||
      hostname.endsWith(".xethub.hf.co") ||
      hostname === "github.com" ||
      hostname === "api.github.com" ||
      hostname === "objects.githubusercontent.com" ||
      hostname === "release-assets.githubusercontent.com" ||
      (hostname.endsWith(".amazonaws.com") && hostname.startsWith("github-production-release-asset-"))
    );
  } catch {
    return false;
  }
}
