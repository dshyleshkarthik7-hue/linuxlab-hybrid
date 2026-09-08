# LinuxTerminal

A free, beginner-focused platform for learning Linux without requiring expensive hardware or a dedicated Linux computer.

## Start learning

- Homepage: https://linuxterminal.me/
- Simulator: https://linuxterminal.me/simulator.html
- Real Alpine Linux: https://linuxterminal.me/index-v86.html

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

### Engine B — Real Alpine Linux
Run a real Alpine Linux guest in the browser using v86, WebAssembly and xterm.js.

Current browser VM:
- Alpine Linux (Custom GCC): 1 GiB RAM
- Compatibility boot option: same maintained Alpine image and 1 GiB RAM

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
