# Production security and delivery boundary

## Runtime ownership
- Netlify static site and APIs: HTML/CSS/JS, authenticated Tutor, certificate issuance/verification, CSP reports, and the /api/v86-firmware and /api/iso/linux4 edge routes.
- Cloudflare Worker: large ISO delivery, chunking, caching, integrity metadata, and upstream fallback to configured GitHub Releases and Hugging Face Bucket URLs. The browser may call this Worker directly for Alpine virt and Developer Alpine when the UI is configured for it.
- Large images: Developer Alpine is about 659 MiB and must not be buffered as one response in a Netlify function. Keep fixed-size chunks, immutable cache keys, bounded retries, resumable storage where available, and final SHA-256 verification before v86 receives the image.
- Origin fallback: GitHub Releases and Hugging Face Bucket are alternative origins, not a guarantee of availability. Verify both with synthetic requests, range tests, and expected digest checks before treating either as production-ready. Consider Cloudflare R2 as a stable primary origin if configured and measured.

## Required delivery contract
- GET and HEAD work; OPTIONS/CORS behavior is explicit.
- Range and chunk requests reject malformed bounds and never return bytes from another artifact/version.
- Cache keys include artifact identity/version and byte range or chunk offset. A changed manifest must not reuse stale chunks.
- For buffered ISO paths, verify declared size and full SHA-256 before starting the emulator. The Developer Alpine lazy-streaming path currently pins the full artifact digest in the URL but does not verify each fetched chunk against an independently trusted per-chunk digest manifest; the UI must report that path as integrity-unverified until such a manifest is generated at release time and enforced.
- User-visible phases distinguish manifest, download, integrity check, emulator start, and guest boot. A network timeout must not be reported as a guest boot failure.
- Log only phase/error codes and coarse timings by default. Never collect terminal keystrokes, guest files, or command output unless a separate explicit opt-in feature requires it.

## Security model
The guest kernel is not running on a shared Linux host, but the host browser and renderer remain part of the attack surface. WebAssembly, v86, JavaScript, browser APIs, ISO parsing, and cross-origin isolation all matter. This browser VM is not equivalent to a server-side microVM and must not be described as a perfect sandbox or as making host security irrelevant. Keep resource limits, explicit reset/stop controls, artifact verification, and safe handling of guest output. Production status remains BLOCKED for any claim of hostile-workload isolation until independently enforced server-side CPU/process/filesystem isolation exists; this does not prevent a clearly labeled educational browser VM from being offered with an accurate threat model.

CORS Origin checks are not authentication because non-browser clients can forge the header. Rate limits must use a real client identity or signed short-lived tokens where needed; ensure a Netlify-to-Cloudflare proxy does not collapse all clients into one egress-IP bucket.

## Single model policy
Use only Qwen/Qwen3-8B for Tutor and optional certificate-study explanations, pinned to the immutable revision in docs/PRODUCTION.md. Keep the provider token server-side. The certificate grader remains deterministic; model output is explanatory and never authoritative for scoring or signing.

## Ads and sponsorship
Use a first-party, clearly labeled sponsor card after the lesson or at the end of a tutorial. Do not place ads in the terminal viewport, VM boot UI, certificate assessment, login, or recovery dialogs. Avoid popups, autoplay audio/video, sticky overlays, layout shifts, or third-party scripts on VM routes. Disclose affiliate links and use aggregate, privacy-respecting measurement.

## Release gates
Before production rollout, require npm ci, typecheck/build, static security, command page quality, artifact/LFS checks, browser/mobile/accessibility tests, real guest boots for each published ISO, and production smoke checks for CSP/COEP/COOP, MIME, CORS, Range, cache headers, and hashes. Keep a known-good deploy ID and a tested rollback procedure.


## AI-assisted certificate study feedback

Tutor and certificate study feedback use the same pinned `Qwen/Qwen3-8B@b968826d9c46dd6066d109eabc6255188de91218` model. The model only explains server-derived topic labels and suggests study tasks; server-side deterministic grading, HMAC signing, issuance, and verification remain authoritative. The feedback endpoint is authenticated, topic-allowlisted, and rate-limited.
