export type PinnedArtifact = {
  version: string;
  architecture: string;
  filename: string;
  url: string;
  sha256: string;
  releaseManifestUrl: string;
};

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyArtifact(bytes: ArrayBuffer, artifact: PinnedArtifact): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/i.test(artifact.sha256)) {
    throw new Error(`Artifact ${artifact.filename} has no trusted SHA-256 digest configured`);
  }
  return (await sha256Hex(bytes)).toLowerCase() === artifact.sha256.toLowerCase();
}

/**
 * Version and artifact are pinned to an official Alpine release. The digest must be
 * copied from the signed Alpine release metadata before a production VM may boot.
 * Failing closed is intentional: a missing digest is never treated as trusted.
 */
export const ALPINE_ARTIFACT: PinnedArtifact = {
  version: '3.24.1',
  architecture: 'x86',
  filename: 'alpine-virt-3.24.1-x86.iso',
  url: 'https://dl-cdn.alpinelinux.org/alpine/v3.24/releases/x86/alpine-virt-3.24.1-x86.iso',
  releaseManifestUrl: 'https://dl-cdn.alpinelinux.org/alpine/v3.24/releases/x86/alpine-virt-3.24.1-x86.iso.sha256',
  sha256: 'REPLACE_WITH_TRUSTED_RELEASE_SHA256',
};
