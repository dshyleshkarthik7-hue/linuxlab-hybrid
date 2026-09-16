# Threat model

## Security boundary

LinuxTerminal has two execution environments. The educational simulator is browser-local and intentionally constrained. The real Linux lab runs an x86 guest with v86 in the browser.

The browser VM is **not a host-kernel security boundary**. Its memory, process, filesystem, CPU, timeout, output, and network controls are defense-in-depth application controls. Guest telemetry is observational and must never be presented as proof of host isolation.

This repository therefore must not be deployed as a multi-tenant service that promises safe execution of hostile arbitrary workloads on shared backend infrastructure solely because the workload runs inside browser v86.

## Assets to protect

- learner authentication and certificate records
- Tutor provider credentials and signing secrets
- release metadata and pinned ISO digests
- production infrastructure and other users' data
- browser stability and reasonable resource consumption

Secrets must remain server-side and must never be placed in the guest image or browser-visible configuration.

## Trust assumptions

- Static application assets and pinned release metadata are trusted inputs.
- Learner prompts, terminal commands, guest output, and guest telemetry are untrusted inputs.
- Edge functions enforce authentication, origin checks, input limits, timeouts, and rate limits where configured.
- Server-side certificate grading and signing are authoritative for certificates.

## Real Linux lab limitations

A malicious guest can potentially consume browser resources in ways that are not equivalent to host-kernel resource enforcement. Browser lifecycle controls can stop the VM, but they do not provide cgroups, seccomp, a separate host kernel, or equivalent server-side isolation.

If the product later requires hostile multi-user arbitrary-code execution, add an independently enforced server-side sandbox (for example a dedicated microVM or another hardened executor) with explicit CPU, memory, process, filesystem, lifetime, and network policy. Do not infer that guarantee from this browser VM.

## Artifact integrity

Large ISO files are fetched in validated byte ranges. The client incrementally computes SHA-256 while assembling the artifact and compares the final digest with the pinned release digest before accepting it. Cached artifacts are revalidated against the pinned metadata before reuse.

## Operational controls

Production releases should require protected `main`, passing CI, reviewed changes, secret configuration outside Git, deployment smoke tests, and a documented rollback path. Repository branch protection is a GitHub setting and cannot be represented by source code alone.
