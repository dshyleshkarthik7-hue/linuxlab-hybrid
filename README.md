# LinuxLab Hybrid — Learn Linux Without Expensive Hardware

> A free, beginner-focused Linux learning platform with **two learning environments**: a safe simulator and real Alpine Linux running in the browser.

LinuxLab Hybrid was created to help students and learners practice Linux even when they do not have a dedicated Linux computer, powerful hardware, or easy access to learning resources.

## 🌐 Try LinuxLab

- **Homepage:** https://linuxlab-hybrid.netlify.app/
- **Learning Simulator:** https://linuxlab-hybrid.netlify.app/simulator.html
- **Real Alpine Linux:** https://linuxlab-hybrid.netlify.app/index-v86.html

## 🎯 What learners can do

### 🧪 Engine A — Learning Simulator
A safe educational environment for practicing common Linux concepts:

- Navigate with `pwd`, `ls`, and `cd`
- Create and manage files and folders
- Practice `cp`, `mv`, `rm`, and `find`
- Learn pipes, redirection and shell operators
- Use text tools such as `grep`, `sort`, `uniq`, and `wc`
- Explore beginner programming workflows
- Learn networking commands in an educational simulated environment

**Important:** Engine A is a simulator designed for learning. It is not a complete Linux kernel or full Bash implementation.

### 🐧 Engine B — Real Alpine Linux
A real Alpine Linux guest running inside the browser through:

- v86 x86 emulation
- WebAssembly
- xterm.js terminal integration
- Browser-side Linux execution

Profiles include:

- **Quick Linux — 256 MB RAM**
- **Developer Linux — 1 GB RAM** for heavier development work

The real VM is temporary. Learners should not enter real passwords or sensitive information.

## 📚 Learning philosophy

LinuxLab teaches both **what a command does** and **what happens behind it**.

For example:

```text
source code → compiler → machine code + metadata → executable → Linux loads it → process runs
```

The project includes beginner explanations, interactive command examples, a 200+ command reference, guided practice and knowledge checks.

## 🚀 Ways to start learning Linux

1. **LinuxLab in your browser** — easiest and safest starting point.
2. **Oracle VM VirtualBox** — run Linux inside a virtual machine while keeping your current operating system.
3. **Dual boot** — install Linux alongside another operating system.
4. **Full installation** — use Linux directly as your main operating system when comfortable.

For beginners, starting with a virtual machine is generally the safest practical path.

## 🏗️ Architecture

```text
Browser
├── Engine A: TypeScript educational Linux simulator
│   ├── Virtual filesystem
│   ├── Command engine
│   └── Learning workflows
│
└── Engine B: Real Linux
    ├── xterm.js
    ├── v86 + WebAssembly
    ├── Alpine Linux guest
    └── Netlify Edge range streaming
```

## 🧪 Automated testing

Run the simulator regression tests:

```bash
npm test
```

Run the production build:

```bash
npm run build
```

CI checks important learner workflows including:

- navigation
- pipes
- redirection
- `cp` and `mv`
- `find`
- filesystem operations

## 💻 Development

### Requirements

- Node.js 22+
- npm 10.8+

### Install

```bash
git clone https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid.git
cd linuxlab-hybrid
npm ci
```

### Run locally

```bash
npm run dev
```

### Build

```bash
npm run build
```

## ⚠️ Transparency

LinuxLab clearly separates simulated learning from real Linux:

- **Simulator:** educational model for safe practice
- **Real Alpine:** actual Linux guest running through browser x86 emulation

This distinction is important because learners should understand what they are practicing.

## 🔐 Privacy and sessions

The core learning experience does not require an account. Browser-based learning data may be stored locally where persistence is enabled.

Real Linux sessions are temporary and can lose files or history when the session closes or restarts.

## 🗺️ Sitemap and indexing

- Sitemap: https://linuxlab-hybrid.netlify.app/sitemap.xml
- Robots: https://linuxlab-hybrid.netlify.app/robots.txt

## 🤝 Project goal

LinuxLab Hybrid is built with one main goal:

> **Help learners access practical Linux education without being blocked by expensive resources or complicated setup.**

## License

Copyright (c) 2026 Shylesh Karthik D. All rights reserved. See `LICENSE`.
