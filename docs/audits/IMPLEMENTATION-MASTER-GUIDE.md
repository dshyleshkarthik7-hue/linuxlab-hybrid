# LinuxTerminal.me implementation master guide

## Release discipline
Build from source data, not hand-edited generated output. Run checks against the exact commit, review generated diffs, use a deploy preview, and retain a known-good deploy ID for rollback. Do not mark a release verified when browser tests, artifacts, or actual boot images are missing.

## Developer Alpine (~659 MiB): recommended boot and delivery plan
1. Use the Cloudflare Worker for large ISO delivery and chunking. Keep GitHub Releases and Hugging Face Bucket as fallback origins; prefer R2 as primary origin if provisioned and load-tested.
2. Serve bounded chunks (current Worker maximum is 32 MiB), keyed by artifact version and chunk offset. Support GET/HEAD and correct Range/Content-Range behavior. Reject malformed ranges.
3. The current lazy path validates chunk bounds and lengths but does not have trusted per-chunk hashes. Keep Developer Alpine visibly integrity-unverified until the release pipeline generates a versioned per-chunk SHA-256 manifest and the Worker/client verifies every chunk. Do not describe the full ISO as verified merely because the URL contains its full-image digest.
4. Avoid simultaneous full-size ArrayBuffers. Persist chunks in IndexedDB/Cache Storage only with quota handling; start with sequential chunks, then consider 2–4 concurrent requests after mobile tests.
5. Use bounded exponential retries with jitter for transient network failures. Integrity mismatch should invalidate that chunk, not loop forever. Expose retry, cancel, resume, clear-cache, and switch-to-Alpine-virt actions.
6. Separate phases and timeouts: manifest, download, verification, emulator initialization, guest boot. A 180-second edge timeout must not be reused as a guest-boot timeout.
7. Register v86 event handlers before run(). Make start/stop idempotent, dispose old emulator instances/listeners before retry, and show a recovery state with a non-sensitive diagnostic code.
8. Test cold/warm cache, offline interruption, browser tab suspension, storage quota exhaustion, 429/5xx origins, invalid digest, repeated start/stop, and constrained mobile memory.

## Edge topology
- Netlify serves the site, Tutor/certificate APIs, /api/v86-firmware, and /api/iso/linux4.
- /api/iso/linux4 currently proxies to the Cloudflare Worker; verify real-client rate-limit identity and whether the extra hop is justified.
- Cloudflare Worker is the large-ISO path for Developer Alpine and Alpine virt. Firmware should remain a small immutable static asset delivered through the Netlify edge path requested by the application.
- Origin checks only control browser CORS and do not authenticate a request. Do not depend on CORS to prevent direct downloads or abuse.

## Browser VM security boundary
The guest kernel does not run on the site's shared server, but the host browser and renderer remain security-critical. v86/WASM, JavaScript, Web APIs, cross-origin isolation, ISO parsing, and guest output are part of the threat surface. Do not call the VM a perfect sandbox. Disable guest networking unless explicitly reviewed; verify artifacts before boot; cap memory/runtime/concurrency; keep state temporary by default; never send terminal contents or keystrokes to Tutor/telemetry implicitly.

## One model for Tutor and certificate study
Configure only Qwen/Qwen3-8B at the immutable revision documented in docs/PRODUCTION.md. Keep HF_TOKEN server-side. Tutor and optional certificate study explanations may use the model; grading, pass/fail, answer-key checks, and signed issuance remain deterministic. Validate provider syntax and a live staging request before production.

## SEO and command database
The catalog contains 6,161 command records but only records with a meaningful summary and example (or curated lesson metadata) should be indexable. Thin pages should remain accessible to on-site search but be noindex and omitted from the sitemap. Never fabricate output, supported distributions, options, or related commands. Expand tutorials with verified task-based examples for chmod/permissions, grep, ls, find, pipes/redirection, process management, and networking. Add Person schema only for truthful, confirmed founder information. Backlinks must be measured outside the repository; no ranking guarantee follows from schema or word count.

## Low-friction sponsorship
Use a small first-party Sponsored card after the lesson or at the end of tutorials. Reserve space to avoid layout shift. Never cover the terminal/VM, intercept commands, appear during boot, interrupt exams/login, autoplay sound, or show sticky popups. Keep sponsorship separate from instructional answers, disclose affiliate links, and use privacy-respecting aggregate measurement.

## Code-only tutorial video pipeline
Run node scripts/video/generate-tutorial-video.mjs data/tutorial-videos/pwd-ls-cd.json public/videos/pwd-ls-cd.mp4. Requires ffmpeg and ffprobe. Input must be a JSON lesson with 1–40 slides, command and explanation per slide, optional explicitly verified output, and bounded duration. The script uses text files rather than interpolating user text into a filter expression, disables drawtext expansion, avoids shell execution, concatenates encoded segments, and validates the result with ffprobe. Narration is not synthesized. Review content and output before publication; do not generate pages/videos from bare command names.

## Release checklist
- [ ] npm ci, TypeScript build, full CI and security checks pass.
- [ ] Git LFS assets are hydrated and size/hash preflight passes.
- [ ] Real Alpine virt, Developer Alpine, and linux4 guest boots pass on desktop and constrained mobile.
- [ ] Cold/warm download, retry/resume, storage quota, digest mismatch, reset, and timeout recovery are tested.
- [ ] Live CORS, CSP, COEP/COOP, MIME, Range, caching, and integrity headers are checked.
- [ ] Qwen provider/model pin passes authenticated staging tests.
- [ ] Sitemap contains only eligible pages; Search Console is checked after rollout.
- [ ] Sponsor disclosures and no-overlay policy are reviewed.
- [ ] Rollback deploy ID is recorded and tested.
