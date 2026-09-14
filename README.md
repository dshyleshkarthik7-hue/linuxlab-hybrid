# LinuxTerminal

A free, beginner-focused platform for learning Linux without requiring expensive hardware or a dedicated Linux computer.

## Start learning

- Homepage: https://linuxterminal.me/
- Simulator: https://linuxterminal.me/simulator/
- Real Alpine Linux: https://linuxterminal.me/real-linux/

## Three ways to learn

### Quick Preview

A lightweight, simulated command preview on the homepage.

### Engine A — Learning Simulator

Practice Linux concepts safely:

- `pwd`, `ls`, `cd`
- files and directories
- `cp`, `mv`, `rm`, `find`
- pipes and output redirection (`>`, `>>`, `2>` and `2>>`)
- `grep`, `sort`, `uniq`, `wc`
- programming and command practice

This environment is an educational simulator, not a full Linux kernel. Its shell grammar is intentionally limited: conditional operators, sequences, pipelines, quoting, escaping, and output redirection are supported; input redirection, subshells, command substitution, background jobs, and heredocs are not.

### Engine B — Real Linux Lab

Run compatible 32-bit x86 Linux guests in the browser using a deployment-local, version-matched v86 browser bundle, WebAssembly and xterm.js. The emulator runtime is preflight-checked before a VM is created, and unsupported architectures are rejected instead of failing silently.

Current browser VM profiles:
- **Developer Alpine**: primary learning image, 1 GiB RAM
- **Alpine Virt 3.24.1 Lightweight x86**: compatibility profile, 512 MiB RAM
- **Ultra Light Linux 4**: approximately 7.4 MB release image, 256 MiB RAM

### Networking and package installation

The ISO download endpoint is a server-side **ISO relay only**. It does not by itself provide Internet access to the guest VM.

Developer Alpine package installation (for example, `apk add`) works only when a guest-network backend is explicitly available and configured. The current browser VM must not claim arbitrary Internet access unless that path has been verified end-to-end. This service is not a VPN, anonymity service, privacy boundary, or guarantee of Internet access. Never enter passwords, tokens, private keys, or other sensitive information in the VM.

The real-Linux page reports boot/runtime state separately from guest activity. Guest-reported CPU, memory, disk and other usage statistics are **UX indicators only**. They are not system-health proof, security status, or host resource enforcement signals.

The 256 MiB figures shown by some Engine A `top`/`free` demonstrations are illustrative simulator data, not the RAM allocated to Engine B.

Real VM sessions are temporary. Do not enter real passwords, private keys, tokens, or sensitive information.

Alpine uses `apk` for package management (for example, `apk add python3`). `apt` is not the Alpine package manager.

## Learning goal

LinuxTerminal is designed for learners who should not be blocked from practicing Linux because they lack hardware, money, or easy access to resources.

## Ways to use Linux

1. LinuxTerminal in the browser
2. Oracle VM VirtualBox
3. Dual boot
4. Full installation

For beginners, a virtual machine is usually the safest next step.

## Development

Requirements:
- Node.js 22+
- npm 10.8+

```bash
git clone https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid.git
cd linuxlab-hybrid
npm ci
npm run dev
```

Build:

```bash
npm run build
```

Tests:

```bash
npm test
npm run check
npm run test:smoke
```

Browser smoke testing uses the pinned `playwright@1.56.0` development dependency. The exact dependency graph is committed in `package-lock.json`, so CI and local development use `npm ci` for reproducible installs.

`npm run check` runs the learning-engine regression checks followed by the TypeScript and production build checks used by CI.

### ISO integrity

Each VM profile has a pinned SHA-256 digest and exact expected byte size. The browser verifies the complete response before accepting an ISO. The server-side relay validates the requested artifact against the corresponding GitHub release manifest, including asset name, release digest, and size, before streaming it. The relay deliberately does not claim that it has independently hashed the streamed body; the browser's complete-artifact SHA-256 verification is the final acceptance check.

Verified artifacts are cached in memory for the active page and in IndexedDB across browser sessions. Persistent cache entries are re-verified against the pinned digest and size before reuse; failed or unavailable cache operations fall back to a fresh verified download.

For release verification, treat the pinned release checksum as the source of truth and verify a downloaded ISO locally:

```bash
sha256sum linux4.iso
```

Only use an ISO when its SHA-256 matches the checksum published by the release owner. A fallback mirror must contain the same verified artifact; availability fallback is not a substitute for cryptographic verification.

## Transparency

- **Simulator:** educational model for safe practice. Commands that demonstrate networking, processes, memory, or disks are explicitly labelled **SIMULATED** and do not represent the learner's real machine or network.
- **Real Alpine:** actual Linux guest running through browser x86 emulation. The guest is temporary and should be treated as an untrusted practice environment.

### Resource-policy boundary

Engine A resource limits are enforced by the simulator itself. Real-Linux browser controls are defense-in-depth lifecycle controls; they are **not a host-kernel security boundary**. The browser allocates a bounded v86 memory configuration, disables guest networking, limits session duration, serial traffic, command/output handling, and pipeline depth.

Guest CPU, process-count, filesystem, and guest-memory telemetry are **untrusted, UX-only observations**. They may be displayed as guest-reported activity so learners can see whether a VM appears busy, idle, or laggy. They must not be used to establish that the VM is safe, healthy in a security sense, isolated, or within a host resource budget. The guest can stop reporting or falsify them. A modified client can bypass browser-side policy, and browser-emulated guests must not be treated as equivalent to a dedicated VM, container, or server-side sandbox.

The application therefore does **not** use guest telemetry to gate VM health or security decisions. Runtime health means the browser emulator reached its expected boot/identity state; guest activity remains informational. Browser-enforced lifecycle controls such as bounded VM allocation, session duration, serial/output handling, pipeline depth, and disabled guest networking are separate from guest observations.

Guest identity is **detected**, not cryptographically proven, from guest output. ISO integrity is established separately by pinned artifact metadata plus complete browser-side SHA-256 verification.

Production security status remains **BLOCKED** until a real server-side or otherwise independently enforced guest CPU/process/filesystem isolation mechanism is introduced and validated with adversarial host-impact tests. Demoting telemetry to UX-only improves the trust model, but it does not create a missing isolation boundary.

### Reset and saved data

A sandbox reset starts a fresh in-memory learning environment. Saved learning records are browser-local and are separate from a sandbox reset. The storage layer bounds workspace content, command history, session records, and quiz answers to prevent unbounded browser-local growth. Use the site's saved-data controls when you want to remove persistent learning records.

## SEO

- Sitemap: https://linuxterminal.me/sitemap.xml
- Robots: https://linuxterminal.me/robots.txt

## Project mission
