# Real guest CPU/process/filesystem isolation status

**Status: BLOCKED — not production-ready.**

This repository has a browser-local v86 guest, but the ISO build path currently uses host mounts during `chroot` setup. In particular, the builder recursively binds host `/sys`, `/dev`, and `/run` into the rootfs before packaging it. That is not an acceptable production build boundary.

The browser VM's v86 memory/CPU resource policy is useful for browser-side resource control, but it is not equivalent to a host-process/filesystem isolation boundary. The production claim must therefore be limited to the isolation actually demonstrated by runtime integration tests.

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
   - Verify guest CPU/resource limits, process visibility, filesystem root, and absence of unintended host paths.
   - Treat a browser v86 guest as a guest emulator, not as a security boundary against a compromised browser process.

4. **CI verification**
   - CI must run static build-boundary checks and the real guest smoke/integration suite where the runner supports it.
   - A missing digest, unsafe host mount, or failed runtime isolation assertion must fail CI.

5. **Production documentation/status**
   - Do not mark this feature production-safe until all four technical gates pass.
   - Record the exact ISO version and SHA-256 digest used by production.

## Current findings

- `src/core/ISOIntegrity.ts` already provides fail-closed SHA-256 verification for browser-fetched artifacts and contains pinned release assets.
- `iso-builder/build-linuxlab-gcc.sh` downloads the Alpine minirootfs and standard ISO without verifying a fixed digest before use.
- `iso-builder/build-linuxlab-gcc.sh` recursively binds host `/sys`, `/dev`, and `/run` into the rootfs.
- `.github/workflows/ci.yml` currently does not execute a build-boundary or real-guest isolation gate.

Until those findings are resolved and demonstrated by CI, the production status remains **BLOCKED**.
