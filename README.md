# LinuxLab Hybrid — Ready Build

LinuxLab is a browser systems-programming laboratory with two engines:

- **Engine A:** deterministic educational Linux/shell/C environment.
- **Engine B:** real x86 Alpine Linux running under v86 in the browser, with a real GCC toolchain.

## Project layout

```text
linuxlab-hybrid-ready/
├── iso-builder/
│   ├── build-alpine-gcc.ps1
│   └── work/
│       ├── build-linuxlab-gcc.sh
│       └── alpine-minirootfs-3.24.1-x86.tar.gz
├── public/
├── src/
├── index.html
├── index-v86.html
├── simulator.html
├── package.json
├── package-lock.json
├── vite.config.ts
└── tsconfig.json
```

## Requirements

- Windows 10/11
- WSL2 with Ubuntu
- Node.js **22 LTS or newer**
- PowerShell

Node 22 is required because the current Wrangler/Cloudflare development dependencies require it.

## 1. Install web dependencies

From the repository root:

```powershell
npm ci
```

## 2. Build the Alpine GCC ISO

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\iso-builder\build-alpine-gcc.ps1
```

The builder uses Ubuntu WSL only for host-side utilities. It does **not** require Ubuntu packages named `apk-tools`, `abuild`, or `alpine-keys`.

The build:

1. downloads Alpine 3.24.1 x86 minirootfs when needed;
2. uses `qemu-i386-static` to execute the 32-bit Alpine userspace on an x86_64 WSL host;
3. installs Alpine's real GCC/build toolchain;
4. creates a direct root shell on `ttyS0` for the browser lab;
5. builds the initramfs and bootable ISO;
6. writes the final image to `public/alpine.iso`.

## 3. Build the web application

```powershell
npm run build
```

The Vite production output is written to:

```text
dist/
```

To build both the web application and ISO:

```powershell
npm run build:all
```

## 4. Run locally

```powershell
npm run dev
```

For Engine B, open the generated v86 page from the Vite server.

## Engine B GCC test

After Alpine boots, run:

```sh
linuxlab-gcc-test
```

or:

```sh
cd /root/examples
gcc hello.c -o hello
./hello
```

This is the actual Alpine x86 GCC toolchain running inside the emulated guest.

## Deployment

Deploy the generated `dist/` directory to a static host. The browser v86 engine requires the COOP/COEP headers supplied by `public/_headers` (or equivalent headers configured on your hosting platform).

The generated ISO is intentionally a disposable lab environment with a root shell on the emulated serial console. **Do not treat it as a hardened production operating system.**
