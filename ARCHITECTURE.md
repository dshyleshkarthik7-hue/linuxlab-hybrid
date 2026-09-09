# Architecture

## Overview

LinuxLab has two deliberately separate execution environments.

### Engine A — Educational simulator

The simulator implements a constrained, browser-local model of common shell workflows and beginner programming exercises. It is designed for predictable learning feedback, not for compatibility with a full Linux kernel.

Key boundaries:

- No real host shell access.
- Simulated networking and system information are explicitly labelled.
- The educational C and Java evaluators are interpreters with step guards.
- Workspace persistence is browser-local IndexedDB.

### Engine B — Real browser VM

Engine B runs a compatible x86 Linux guest through the deployment-local v86 runtime.

Lifecycle:

1. Load the local v86 browser bundle.
2. Preflight required runtime assets.
3. Check the selected ISO endpoint (Developer Alpine, Alpine Virt, or Ultra Light Linux 4).
4. Create one VM instance.
5. Observe serial output and health state.
6. Cancel stale boot work when a newer boot begins.
7. Destroy the VM on page exit.

The VM is temporary and should not be treated as a secure place for passwords, keys, tokens, or private data.

## State ownership

- `LinuxLabApp` owns simulator UI state.
- `InBrowserLinuxEngine` owns Engine A filesystem and command state.
- `StorageService` owns IndexedDB persistence.
- `V86LinuxTerminal` owns one Engine B lifecycle.

Browser globals are limited to the typed `window.V86` runtime constructor and the optional typed `window.linuxLabVM` inspection handle used by smoke tests.

## Shell semantics

Engine A tracks command success separately from returned text. This matters because shell control operators depend on status:

- `&&` runs the next command only after success.
- `||` runs the fallback only after failure.
- `;` always continues.
- Diagnostics from a failed command do not pollute successful fallback output.

Regression tests cover mixed chains and quoted operators.

## Persistence safety

Only supported workspace files are persisted:

- `main.c`
- `Main.java`

Unexpected filenames are rejected before IndexedDB writes or reads.
