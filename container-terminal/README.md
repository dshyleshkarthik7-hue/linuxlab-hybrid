# LinuxTerminal free container terminal

Optional backend for a short-lived educational container terminal. It is separate from Netlify and the existing browser v86 VM.

Default limits: Kali rolling image, 256 MiB RAM, 0.5 CPU, 64 processes, 15-minute session, no network, non-root UID 65532, all capabilities dropped, no-new-privileges, read-only root filesystem, small temporary filesystems, and two concurrent sessions.

Build/run on a dedicated container host. The backend host needs Docker access to create child containers; never expose the Docker socket to child containers. Put the WebSocket service behind TLS, authentication, and rate limiting before public use.

The frontend reads `VITE_CONTAINER_TERMINAL_WS`. If unset, it stays disabled.

Kali and the software are free; public container hosting may still have provider limits or charges. This repository does not claim zero hosting cost.
