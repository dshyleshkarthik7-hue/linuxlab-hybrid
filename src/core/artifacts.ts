export type PinnedArtifact = {
  version: string;
  architecture: string;
  filename: string;
  url: string;
  sha256: string;
  size: number;
  releaseManifestUrl: string;
};

export const ALPINE_ARTIFACT: PinnedArtifact = {
  version: '3.24.1', architecture: 'x86', filename: 'alpine-virt-3.24.1-x86.iso',
  url: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/V2.00/alpine-virt-3.24.1-x86.iso',
  releaseManifestUrl: 'https://api.github.com/repos/dshyleshkarthik7-hue/linuxlab-hybrid/releases/tags/V2.00',
  sha256: '9895695d27eabc1e2782598ff0190f7966df8317cc2afe2a6d25360e148a4209', size: 51380224,
};
export const DEVELOPER_ALPINE_ARTIFACT: PinnedArtifact = {
  version: 'v1.0.0', architecture: 'x86', filename: 'alpine.iso',
  url: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso',
  releaseManifestUrl: 'https://api.github.com/repos/dshyleshkarthik7-hue/linuxlab-hybrid/releases/tags/v1.0.0',
  sha256: '9a4683039f356b6bdfa40897f1985b39d5a02e0f46d477e427e8262401301211', size: 691011584,
};
export const LINUX4_ARTIFACT: PinnedArtifact = {
  version: 'v3.00', architecture: 'x86', filename: 'linux4.iso',
  url: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v3.00/linux4.iso',
  releaseManifestUrl: 'https://api.github.com/repos/dshyleshkarthik7-hue/linuxlab-hybrid/releases/tags/v3.00',
  sha256: 'a8ea434ab3b177c55f01275dcc1d35f52cfbee9bd44a32e74765c975b58bcc73', size: 7731200,
};
export const SEABIOS_ARTIFACT: PinnedArtifact = {
  version: 'v86-firmware-1', architecture: 'x86', filename: 'seabios.bin',
  url: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v86-firmware-1/seabios.bin',
  releaseManifestUrl: 'https://api.github.com/repos/dshyleshkarthik7-hue/linuxlab-hybrid/releases/tags/v86-firmware-1',
  sha256: '73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98', size: 131072,
};
export const VGABIOS_ARTIFACT: PinnedArtifact = {
  version: 'v86-firmware-1', architecture: 'x86', filename: 'vgabios.bin',
  url: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v86-firmware-1/vgabios.bin',
  releaseManifestUrl: 'https://api.github.com/repos/dshyleshkarthik7-hue/linuxlab-hybrid/releases/tags/v86-firmware-1',
  sha256: 'a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880', size: 36352,
};
