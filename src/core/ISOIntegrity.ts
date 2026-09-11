export type PinnedArtifact = {
  version: string;
  architecture: string;
  filename: string;
  url: string;
  sha256: string;
  releaseManifestUrl: string;
};

const SHA256_RE = /^[a-f0-9]{64}$/i;

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function assertTrustedArtifact(artifact: PinnedArtifact): void {
  if (!SHA256_RE.test(artifact.sha256)) {
    throw new Error(`Artifact ${artifact.filename} has no trusted SHA-256 digest configured`);
  }
}

export async function verifyArtifact(bytes: ArrayBuffer, artifact: PinnedArtifact): Promise<boolean> {
  assertTrustedArtifact(artifact);
  const actual = await sha256Hex(bytes);
  if (actual.toLowerCase() !== artifact.sha256.toLowerCase()) {
    throw new Error(`Artifact ${artifact.filename} failed SHA-256 integrity verification`);
  }
  return true;
}

export async function verifyResponse(response: Response, artifact: PinnedArtifact): Promise<ArrayBuffer> {
  if (!response.ok) throw new Error(`Artifact ${artifact.filename} download failed (${response.status})`);
  const bytes = await response.arrayBuffer();
  await verifyArtifact(bytes, artifact);
  return bytes;
}

/**
 * These digests are the immutable GitHub Release asset digests for the exact
 * images served by the production relay. The release asset itself is pinned by
 * tag and filename; verification fails closed before a VM is created.
 */
export const ALPINE_ARTIFACT: PinnedArtifact = {
  version: '3.24.1',
  architecture: 'x86',
  filename: 'alpine-virt-3.24.1-x86.iso',
  url: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/V2.00/alpine-virt-3.24.1-x86.iso',
  releaseManifestUrl: 'https://api.github.com/repos/dshyleshkarthik7-hue/linuxlab-hybrid/releases/tags/V2.00',
  sha256: '9895695d27eabc1e2782598ff0190f7966df8317cc2afe2a6d25360e148a4209',
};

export const DEVELOPER_ALPINE_ARTIFACT: PinnedArtifact = {
  version: 'v1.0.0',
  architecture: 'x86',
  filename: 'alpine.iso',
  url: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso',
  releaseManifestUrl: 'https://api.github.com/repos/dshyleshkarthik7-hue/linuxlab-hybrid/releases/tags/v1.0.0',
  sha256: '9a4683039f356b6bdfa40897f1985b39d5a02e0f46d477e427e8262401301211',
};

export const LINUX4_ARTIFACT: PinnedArtifact = {
  version: 'v3.00',
  architecture: 'x86',
  filename: 'linux4.iso',
  url: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v3.00/linux4.iso',
  releaseManifestUrl: 'https://api.github.com/repos/dshyleshkarthik7-hue/linuxlab-hybrid/releases/tags/v3.00',
  sha256: 'a8ea434ab3b177c55f01275dcc1d35f52cfbee9bd44a32e74765c975b58bcc73',
};
