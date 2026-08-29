# LinuxLab — Browser-Based x86 Linux Emulator

A lightweight, web-based Linux development environment running x86 emulation directly in the browser via WebAssembly (`v86`) and xterm.js. The guest environment boots a custom Alpine Linux distribution equipped with GCC and essential development utilities.

## Features

* **Client-Side x86 Emulation:** Runs entirely in modern browsers using `v86` compiled to WebAssembly.
* **Pre-Installed Toolchain:** Boots a custom Alpine Linux image featuring GCC 15.2.0, `make`, `nano`, and core build essentials.
* **Low Latency & High Reliability:** Uses a Netlify Edge Function with HTTP Range requests (`/api/iso`) to progressively stream ISO data while avoiding browser CORS and memory limitations.
* **Full Terminal Capabilities:** Powered by `@xterm/xterm` with automatic resizing, terminal color support, and ANSI escape-code handling.
* **Automated Login:** Detects boot stages and login prompts to automatically log in as `root`.

## Architecture Overview

```text
Browser
  │
  │ v86 + xterm.js
  ▼
x86 Emulator
  │
  │ HTTP Range Requests
  ▼
Netlify Edge Function
  │
  │ Server-to-Server Streaming
  ▼
GitHub Releases CDN
  │
  ▼
Custom Alpine Linux ISO
```

### Main Components

* **Frontend (`src/mainv86.ts`)**

  * Initializes the `v86` emulator.
  * Configures SeaBIOS and VGA BIOS.
  * Allocates 1 GiB of guest RAM.
  * Connects virtual serial I/O to the xterm.js terminal.
  * Handles the emulator lifecycle and automated login.

* **Streaming Proxy (`netlify/edge-functions/iso.ts`)**

  * Receives ISO requests from the browser.
  * Forwards HTTP `Range` headers to the GitHub Releases asset.
  * Streams the requested binary data back to the browser.
  * Adds the required CORS and access-control headers.

## Project Structure

```text
linuxlab-hybrid/
├── netlify/
│   └── edge-functions/
│       └── iso.ts              # Binary streaming proxy
├── public/
│   ├── libv86.js               # v86 runtime
│   ├── v86.wasm                # WebAssembly emulator
│   ├── seabios.bin              # SeaBIOS firmware
│   └── vgabios.bin              # VGA BIOS
├── src/
│   └── mainv86.ts              # Terminal & v86 controller
├── netlify.toml                 # Netlify configuration
├── package.json
└── tsconfig.json
```

## Getting Started

### Prerequisites

* Node.js v18 or higher
* npm or pnpm
* A modern web browser with WebAssembly support

### Installation

Clone the repository:

```bash
git clone https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid.git
cd linuxlab-hybrid
```

Install dependencies:

```bash
npm install
```

Start the local development server:

```bash
npm run dev
```

Open the local URL displayed by the development server in your browser.

## Deployment

### Deploying to Netlify

LinuxLab uses a Netlify Edge Function to proxy and progressively stream the Alpine Linux ISO.

1. Push your changes to GitHub:

```bash
git add .
git commit -m "Deploy to production"
git push origin main
```

2. Connect the repository to Netlify.

3. Netlify will automatically use the configuration in `netlify.toml`.

Expected configuration:

```text
Build Command:    npm run build
Publish Directory: dist
Edge Function:    /api/iso
```

After deployment, open the Netlify site and wait for the Linux terminal to boot.

## Quick Usage & Verification

Once the emulator finishes booting and you reach the root shell:

```text
(none):~#
```

Create a C source file:

```bash
nano main.c
```

Add the following program:

```c
#include <stdio.h>

int main(void) {
    printf("LinuxLab x86 emulation is running!\n");
    return 0;
}
```

Compile it:

```bash
gcc main.c -o main
```

Run it:

```bash
./main
```

Expected output:

```text
LinuxLab x86 emulation is running!
```

## How It Works

LinuxLab runs a complete x86 Linux environment inside the browser.

1. The browser loads the `v86` WebAssembly emulator.
2. `v86` initializes the BIOS and virtual x86 hardware.
3. The emulator requests ISO data through `/api/iso`.
4. The Netlify Edge Function forwards HTTP Range requests to the GitHub Releases CDN.
5. The Alpine Linux guest progressively boots from the streamed ISO.
6. Virtual serial output is connected to xterm.js.
7. LinuxLab detects the login prompt and automatically logs in as `root`.
8. The user receives an interactive Linux shell directly in the browser.

## Technology Stack

| Technology             | Purpose                            |
| ---------------------- | ---------------------------------- |
| TypeScript             | Frontend application logic         |
| v86                    | x86 CPU and hardware emulation     |
| WebAssembly            | High-performance browser execution |
| xterm.js               | Interactive terminal interface     |
| Alpine Linux           | Lightweight Linux guest OS         |
| GCC                    | C development toolchain            |
| Netlify Edge Functions | ISO streaming proxy                |
| GitHub Releases        | ISO asset hosting                  |

## License

Copyright (c) 2026 Shylesh Karthik D. All rights reserved.

This project and its source code are proprietary. Unauthorized copying, modification, distribution, or commercial use of this software without prior written permission is strictly prohibited. See LICENSE for full details.
