import { ALPINE_ARTIFACT, DEVELOPER_ALPINE_ARTIFACT, LINUX4_ARTIFACT } from './artifacts.ts';
import type { PinnedArtifact } from './artifacts.ts';
import { Sha256 } from './sha256.ts';

export type { PinnedArtifact } from './artifacts.ts';

const SHA256_RE = /^[a-f0-9]{64}$/i;
const TRUSTED_RELEASE_PREFIX = 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/';
const TRUSTED_MANIFEST_PREFIX = 'https://api.github.com/repos/dshyleshkarthik7-hue/linuxlab-hybrid/releases/tags/';

const trustedUrl = (value: string, prefix: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && value.startsWith(prefix) && !value.includes('..');
  } catch {
    return false;
  }
};

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  return new Sha256().update(new Uint8Array(bytes)).digestHex();
}

export function sha256StreamHex(chunks: Iterable<Uint8Array>): string {
  const hash = new Sha256();
  for (const chunk of chunks) hash.update(chunk);
  return hash.digestHex();
}

export function assertTrustedArtifact(artifact: PinnedArtifact): void {
  if (!SHA256_RE.test(artifact.sha256)) throw new Error(`Artifact ${artifact.filename} has no trusted SHA-256 digest configured`);
  if (!Number.isSafeInteger(artifact.size) || artifact.size <= 0) throw new Error(`Artifact ${artifact.filename} has no trusted exact size configured`);
  if (!trustedUrl(artifact.url, TRUSTED_RELEASE_PREFIX)) throw new Error(`Artifact ${artifact.filename} is not from the trusted release host`);
  if (!trustedUrl(artifact.releaseManifestUrl, TRUSTED_MANIFEST_PREFIX)) throw new Error(`Artifact ${artifact.filename} has an untrusted release manifest URL`);
}

export async function verifyArtifact(bytes: ArrayBuffer, artifact: PinnedArtifact): Promise<boolean> {
  assertTrustedArtifact(artifact);
  if (bytes.byteLength !== artifact.size) throw new Error(`Artifact ${artifact.filename} has unexpected size (${bytes.byteLength}; expected ${artifact.size})`);
  const actual = await sha256Hex(bytes);
  if (actual.toLowerCase() !== artifact.sha256.toLowerCase()) throw new Error(`Artifact ${artifact.filename} failed SHA-256 integrity verification`);
  return true;
}

export async function verifyResponse(response: Response, artifact: PinnedArtifact): Promise<ArrayBuffer> {
  assertTrustedArtifact(artifact);
  if (!response.ok) throw new Error(`Artifact ${artifact.filename} download failed (${response.status})`);
  const length = response.headers.get('content-length');
  if (length !== null && length !== String(artifact.size)) throw new Error(`Artifact ${artifact.filename} response has unexpected size metadata`);
  if (!response.body) throw new Error(`Artifact ${artifact.filename} response has no body`);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  const hash = new Sha256();
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      hash.update(value);
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (size !== artifact.size) throw new Error(`Artifact ${artifact.filename} has unexpected size (${size}; expected ${artifact.size})`);
  const actual = hash.digestHex();
  if (actual.toLowerCase() !== artifact.sha256.toLowerCase()) throw new Error(`Artifact ${artifact.filename} failed SHA-256 integrity verification`);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes.buffer;
}

export { ALPINE_ARTIFACT, DEVELOPER_ALPINE_ARTIFACT, LINUX4_ARTIFACT };
