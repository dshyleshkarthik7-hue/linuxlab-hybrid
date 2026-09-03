# LinuxLab — Browser-Based x86 Linux Emulator

> A real x86 Linux development environment running entirely in the browser.

LinuxLab boots a custom Alpine Linux guest inside the browser using **v86 + WebAssembly**, exposes the guest through **xterm.js**, and delivers the Linux disk through a **Netlify Edge byte-range streaming proxy** backed by a GitHub Release asset.

## Why this project?

LinuxLab explores a practical systems problem: **how can a useful Linux development environment be delivered without requiring a local VM, container, or native installation?**

The project keeps CPU emulation client-side while the edge layer handles efficient delivery of the large guest disk image. The result is a self-contained x86 Linux shell that can compile and run C programs directly in a modern browser.

## ✨ Features

- **Client-side x86 emulation** — v86 executes the guest CPU and hardware model in WebAssembly.
- **Custom Alpine Linux** — lightweight guest image tailored for browser execution.
- **GCC toolchain** — GCC 15.2.0, `make`, `nano`, and core development utilities are available in the guest.
- **Range-aware disk streaming** — `/api/iso` forwards HTTP byte ranges instead of requiring the browser to download the whole image up front.
- **Interactive terminal** — xterm.js provides ANSI handling, terminal resizing, keyboard input, and scrollback.
- **Automated boot/login** — boot-stage detection moves the user from firmware output to a usable root shell.
- **Fallback boot profile** — the existing fallback path can be used when the primary Alpine profile is unavailable.
- **Responsive viewport** — terminal dimensions follow the container using `ResizeObserver` and the fit addon.

## 🏗️ Architecture

```text
┌──────────────────────────────────────────────┐
│                  Browser                     │
│                                              │
│  ┌───────────────┐      ┌────────────────┐  │
│  │   xterm.js    │◄────►│      v86       │  │
│  │ Terminal I/O  │      │ WebAssembly    │  │
│  └───────────────┘      │ x86 emulator   │  │
│                         └───────┬────────┘  │
│                                 │ HTTP Range│
└─────────────────────────────────┼───────────┘
                                  ▼
                    ┌─────────────────────────┐
                    │ Netlify Edge Function   │
                    │ /api/iso                │
                    │ Range + CORS proxy     │
                    └────────────┬────────────┘
                                 │ streaming
                                 ▼
                    ┌─────────────────────────┐
                    │ GitHub Releases CDN     │
                    │ alpine.iso              │
                    └────────────┬────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │ Custom Alpine Linux     │
                    │ GCC + build utilities   │
                    └─────────────────────────┘
```

### Request flow

1. The browser loads the v86 runtime and WebAssembly module.
2. v86 initializes virtual x86 hardware and firmware.
3. The guest requests disk blocks from `/api/iso`.
4. The Netlify Edge Function forwards the browser's `Range` header upstream.
5. GitHub's release infrastructure returns the requested byte range.
6. The edge function streams the response body back without buffering the ISO in application memory.
7. Alpine boots and its serial output is connected to xterm.js.
8. LinuxLab detects the login prompt and completes the configured login flow.
9. The browser receives an interactive Linux shell.

## 📁 Project structure

```text
linuxlab-hybrid/
├── .github/
│   └── workflows/
│       └── ci.yml                 # Reproducible CI build
├── netlify/
│   └── edge-functions/
│       └── iso.ts                 # Range-aware streaming proxy
├── public/
│   ├── libv86.js                  # v86 runtime
│   ├── v86.wasm                   # WebAssembly emulator
│   ├── seabios.bin                # SeaBIOS firmware
│   └── vgabios.bin                # VGA BIOS
├── src/
│   ├── core/                      # Core application modules
│   ├── engine/                    # Emulator/runtime modules
│   ├── ui/                        # UI modules
│   ├── main-v86.ts                # v86 controller
│   ├── main.ts                    # Application entry point
│   └── style.css                  # Application styles
├── netlify.toml                   # Build, edge, and security configuration
├── package.json
└── tsconfig.json
```

## 🚀 Getting started

### Requirements

- Node.js **22+**
- npm **10.8+**
- A modern browser with WebAssembly support

### Install

```bash
git clone https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid.git
cd linuxlab-hybrid
npm ci
```

### Development

```bash
npm run dev
```

### Production build

```bash
npm run build
```

The build performs TypeScript checking before the Vite production bundle is generated.

### Build the Linux image

The existing image-builder workflow is available on Windows PowerShell:

```bash
npm run build:iso
```

To run the complete application + ISO build pipeline:

```bash
npm run build:all
```

## ☁️ Deployment

LinuxLab is designed for Netlify deployment.

```text
Build command:     npm run build
Publish directory: dist
Edge route:        /api/iso
Edge function:     iso
```

The edge endpoint is intentionally a thin streaming proxy: it forwards the incoming byte-range request to the immutable release asset and returns the upstream stream to the browser.

## 🧪 Verification

After the emulator reaches the shell, verify the environment with:

```bash
uname -a
cc --version
gcc --version
```

Then compile a small C program:

```bash
cat > hello.c <<'EOF'
#include <stdio.h>

int main(void) {
    puts("LinuxLab x86 emulation is running!");
    return 0;
}
EOF

gcc hello.c -O2 -o hello
./hello
```

Expected result:

```text
LinuxLab x86 emulation is running!
```

## 📊 Performance notes

LinuxLab's important optimization is **delivery strategy**, not a claim that x86 emulation is equivalent to native execution.

The disk is accessed through HTTP byte ranges so v86 can request portions of the guest image on demand. This avoids making the browser application responsible for eagerly downloading and holding the complete ISO before emulation can begin.

For reproducible performance comparisons, measure these milestones in the deployed environment:

| Metric | What to measure |
|---|---|
| First terminal paint | Page load → terminal visible |
| Emulator start | Terminal visible → v86 initialized |
| First guest output | v86 initialized → first Linux output |
| Shell ready | Boot start → interactive shell |
| Total transfer | Network bytes consumed during boot |

> **Note:** publish measured numbers only after collecting them on the target deployment and browser. This repository does not fabricate benchmark results.

## 🔐 Security model

LinuxLab's guest commands execute inside the **browser-side v86 emulator**, not as shell commands on the Netlify Edge Function.

The edge function's responsibility is limited to fetching and streaming the release asset. It does not expose a server-side shell, accept arbitrary upstream URLs, or execute guest code.

The deployment also sends defensive browser headers including `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and cross-origin policies appropriate to the application's resource-loading model.

Because this is an emulator running untrusted guest software in a browser, users should still treat the environment as a development/demo sandbox rather than a security boundary for sensitive data.

## 🔄 CI

Every push to `main` and every pull request runs a reproducible Node 22 build using `npm ci` followed by `npm run build`.

This catches TypeScript and production-bundle regressions before deployment.

## 🛠️ Technology stack

| Technology | Role |
|---|---|
| TypeScript | Application and emulator integration |
| Vite | Development server and production bundling |
| v86 | x86 CPU/hardware emulation |
| WebAssembly | High-performance browser execution |
| xterm.js | Interactive terminal |
| Alpine Linux | Lightweight guest OS |
| GCC | Native C compilation inside the guest |
| Netlify Edge Functions | Range-aware ISO delivery |
| GitHub Releases | Guest disk asset hosting |

## Known constraints

- x86 emulation is inherently slower than native execution.
- Large guest assets still require network transfer and browser storage/memory.
- Browser behavior varies by device and available resources.
- The edge endpoint intentionally depends on the configured GitHub Release asset.
- The Linux guest is ephemeral unless persistence is explicitly implemented by the application.

## Roadmap

- [ ] Publish measured boot/transfer benchmarks.
- [ ] Add browser compatibility smoke tests.
- [ ] Add optional persistent guest storage.
- [ ] Add richer emulator diagnostics and boot telemetry.
- [ ] Provide additional lightweight guest profiles.

## License

Copyright (c) 2026 Shylesh Karthik D. All rights reserved.

This project and its source code are proprietary. Unauthorized copying, modification, distribution, or commercial use of this software without prior written permission is strictly prohibited. See `LICENSE` for full details.


## Learning reliability checklist

LinuxLab uses two clearly labelled engines: **Engine A** is an educational simulator and **Engine B** is real Alpine Linux in v86. Simulator workspace persistence is local to the browser where enabled; the real VM is temporary and should never be used for real secrets. Before release, verify the happy path: pipes, redirection, cp/mv/find, mobile nano controls and boot-to-prompt.
