export type PinnedArtifact = {
  version: string;
  architecture: string;
  filename: string;
  url: string;
  sha256: string;
};

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyArtifact(bytes: ArrayBuffer, artifact: PinnedArtifact): Promise<boolean> {
  const actual = await sha256Hex(bytes);
  return actual.toLowerCase() === artifact.sha256.toLowerCase();
}

/** Expected digests belong in version-controlled configuration; the artifact cannot supply its own expected digest. */
export const ALPINE_ARTIFACT: PinnedArtifact = {
  version: '3.24.1',
  architecture: 'x86',
  filename: 'alpine-virt-3.24.1-x86.iso',
  url: '/.netlify/edge-functions/iso?image=virt',
  sha256: 'REPLACE_WITH_TRUSTED_RELEASE_SHA256',
};
