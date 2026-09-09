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
- pipes and redirection
- `grep`, `sort`, `uniq`, `wc`
- programming and command practice

This environment is an educational simulator, not a full Linux kernel.

### Engine B — Real Linux Lab
Run compatible 32-bit x86 Linux guests in the browser using a deployment-local, version-matched v86 browser bundle, WebAssembly and xterm.js. The emulator runtime is preflight-checked before a VM is created, and unsupported architectures are rejected instead of failing silently.

Current browser VM profiles:
- **Developer Alpine**: primary learning image, 1 GiB RAM
- **Alpine Virt 3.24.1 Lightweight x86**: compatibility profile, 512 MiB RAM
- **Ultra Light Linux 4**: approximately 7.4 MB release image, 256 MiB RAM

### Developer Alpine networking
Developer Alpine may expose an **experimental network relay** when the deployment provides one. It is best-effort only and is not a VPN, anonymity service, privacy boundary, or guarantee of Internet access. Package installation can therefore work when guest networking is available (for example, Alpine's `apk add` for supported repositories), but downloads can fail because of browser, emulator, relay, repository, CORS, or deployment limits. Never enter passwords, tokens, private keys, or other sensitive information in the VM.

The real-Linux page reports three health states: orange while booting, green when the guest is running or a shell is ready, and black when booting fails. Slow devices are not marked offline merely because Alpine takes longer to initialize.

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
```

`npm run check` runs the learning-engine regression checks followed by the TypeScript and production build checks used by CI.

## Transparency

- **Simulator:** educational model for safe practice. Commands that demonstrate networking, processes, memory, or disks are explicitly labelled **SIMULATED** and do not represent the learner's real machine or network.
- **Real Alpine:** actual Linux guest running through browser x86 emulation. The guest is temporary and should be treated as an untrusted practice environment.

### Reset and saved data

A sandbox reset starts a fresh in-memory learning environment. Saved learning records are browser-local and are separate from a sandbox reset. Use the site's saved-data controls when you want to remove persistent learning records.

## SEO

- Sitemap: https://linuxterminal.me/sitemap.xml
- Robots: https://linuxterminal.me/robots.txt

## Project mission

> Help students and learners access practical Linux education without being stopped by expensive resources or complicated setup.

## License

Copyright (c) 2026 Shylesh Karthik D. All rights reserved. See `LICENSE`.
