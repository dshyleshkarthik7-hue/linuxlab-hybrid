import manifest from '../../artifacts/manifest.json' with { type: 'json' };

export type PinnedArtifact = {
  version: string;
  architecture: string;
  filename: string;
  url: string;
  sha256: string;
  size: number;
  releaseManifestUrl: string;
};

type ManifestArtifact = typeof manifest.artifacts[number] & { image?: string };

function artifact(filename: string): PinnedArtifact {
  const value = (manifest.artifacts as ManifestArtifact[]).find((item) => item.filename === filename);
  if (!value || !value.url || !value.releaseManifestUrl) throw new Error(`Artifact manifest entry missing for ${filename}`);
  return {
    version: value.version,
    architecture: value.architecture,
    filename: value.filename,
    url: value.url,
    sha256: value.sha256,
    size: value.size,
    releaseManifestUrl: value.releaseManifestUrl,
  };
}

export const ALPINE_ARTIFACT = artifact('alpine-virt-3.24.1-x86.iso');
export const DEVELOPER_ALPINE_ARTIFACT = artifact('alpine.iso');
export const LINUX4_ARTIFACT = artifact('linux4.iso');
export const SEABIOS_ARTIFACT = artifact('seabios.bin');
export const VGABIOS_ARTIFACT = artifact('vgabios.bin');
