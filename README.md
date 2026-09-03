# LinuxLab Hybrid

A free, beginner-focused platform for learning Linux without requiring expensive hardware or a dedicated Linux computer.

## Start learning

- Homepage: https://linuxlab-hybrid.netlify.app/
- Simulator: https://linuxlab-hybrid.netlify.app/simulator.html
- Real Alpine Linux: https://linuxlab-hybrid.netlify.app/index-v86.html

## Two ways to learn

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

Profiles:
- Quick: 256 MB RAM
- Developer: 1 GB RAM

Real VM sessions are temporary. Do not enter real passwords or sensitive information.

## Learning goal

LinuxLab is designed for learners who should not be blocked from practicing Linux because they lack hardware, money, or easy access to resources.

## Ways to use Linux

1. LinuxLab in the browser
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
```

## Transparency

- **Simulator:** educational model for safe practice.
- **Real Alpine:** actual Linux guest running through browser x86 emulation.

## SEO

- Sitemap: https://linuxlab-hybrid.netlify.app/sitemap.xml
- Robots: https://linuxlab-hybrid.netlify.app/robots.txt

## Project mission

> Help students and learners access practical Linux education without being stopped by expensive resources or complicated setup.

## License

Copyright (c) 2026 Shylesh Karthik D. All rights reserved. See `LICENSE`.
