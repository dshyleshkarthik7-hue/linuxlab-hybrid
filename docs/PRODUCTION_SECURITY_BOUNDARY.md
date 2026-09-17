# Production Security Boundary

## Browser v86 is not a host-security sandbox

The Real Linux Lab runs an x86 guest entirely in the browser with v86. It provides a real Linux userspace/kernel experience, but it is **not equivalent to a server-side microVM, container sandbox, seccomp policy, cgroup boundary, or separate host kernel**.

The browser controls below are defense-in-depth only:

- network device disabled
- fixed guest memory policy
- bounded session lifetime
- boot watchdog
- serial/output limits
- firmware SHA-256 verification
- fixed ISO SHA-256 verification
- lifecycle cleanup

These controls must not be described as host isolation. The product is suitable for learning and trusted-user experimentation, not for executing hostile code as a security-sensitive multi-tenant service.

If hostile arbitrary-code execution becomes a product requirement, it must be moved to a separately enforced server-side isolation architecture. JavaScript running in the browser cannot create that missing host boundary.

## Artifact trust

All shipped Linux images and firmware have repository-controlled SHA-256 values in `src/core/artifacts.ts`. The ISO edge function validates the GitHub release asset's published digest and size against those fixed values, while the browser performs full-image verification before boot.

Changing an artifact requires changing its pinned digest and passing the integrity tests. A release must never discover a new expected digest dynamically and then trust that value as the verification target.

## Release gate

Production status is blocked if any of these invariants fail:

1. fixed artifact digest verification
2. browser-side full ISO verification
3. firmware digest verification
4. v86 network device remains disabled
5. real-guest boot/readiness tests pass
6. historical secret scan passes
7. dependency audit passes
8. production smoke passes

## Observability warning

Guest-reported CPU, memory, kernel, and activity telemetry is observational. It is not host-enforced resource accounting and must not be presented as proof of host isolation.
