# Real guest CPU/process/filesystem isolation status

**Status: BLOCKED — not production-ready.**

This repository has a browser-local v86 guest. Its browser-side resource policy and guest telemetry are not equivalent to a host-process/filesystem isolation boundary. The production claim must therefore be limited to isolation actually provided by the browser and demonstrated by runtime integration tests.

## Required release gates

1. **Trusted ISO SHA-256 pinning**
   - Every bootable release ISO must have a fixed 64-hex SHA-256 digest in source-controlled release metadata.
   - Verification must happen before an ISO is extracted, mounted, or booted.
   - Missing or mismatched digests must fail closed.

2. **Safer ISO build mounts**
   - The build must not recursively bind host `/sys`, `/dev`, or `/run` into the build root.
   - Build-time `proc`, `sys`, `dev`, and `run` must be isolated temporary filesystems or otherwise explicitly scoped to the build namespace.
   - Cleanup must run on success, failure, and interruption.

3. **Deployment/integration validation**
   - Boot the real guest, not a mocked VM object.
   - Validate resource behavior and filesystem/process visibility independently of guest-reported telemetry.
   - Treat browser-local v86 as an emulator inside the browser sandbox, not as a security boundary against a compromised browser process.

4. **CI verification**
   - CI must run static build-boundary checks and the real guest smoke/integration suite where the runner supports it.
   - A missing digest, unsafe host mount, or failed runtime assertion must fail CI.

5. **Production documentation/status**
   - Do not mark this feature production-safe until the technical gates pass.
   - Record the exact ISO version and SHA-256 digest used by production.

## Telemetry policy

Guest CPU, memory, disk, uptime, and load statistics are **guest-reported activity indicators**. They are useful for UX and diagnostics, but are untrusted input and must never be treated as an isolation, security, or host-health signal.

Until the release gates are resolved and demonstrated by CI, production status remains **BLOCKED**.
