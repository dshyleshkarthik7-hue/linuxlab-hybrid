# Production security boundary

LinuxTerminal is a browser-based Linux learning environment. The browser VM is defense-in-depth only and is **not** a host-kernel sandbox. Do not use it to execute untrusted workloads that require server-side isolation.

For production launch, describe the product as a browser Linux learning environment and keep arbitrary server-side code execution disabled until a separately isolated executor is deployed.

## Artifact integrity

The ISO path uses pinned release metadata and browser-side SHA-256 verification. This protects the learner-facing artifact but is not a claim of host-kernel isolation or end-to-end cryptographic verification of every network hop.

## Launch requirements

- Keep Tutor secrets server-side.
- Keep distributed rate limiting fail-closed.
- Keep certificate signing server-side.
- Run CI, real-guest, mobile, and production smoke tests before release.
- Do not advertise browser VM resource telemetry as host enforcement.
