# Repository audit — 15 October 2026

## Scope and confidence
Reviewed the supplied 308-entry ZIP snapshot and selected current GitHub sources covering command data/generation, SEO routes, Netlify and Cloudflare delivery, artifact manifest, certificate/Tutor configuration, CI, and LFS checks. Dependency-free tests were run against the ZIP snapshot. This is not proof that every line, secret, production response header, browser/device combination, or actual ISO boot was verified. The ZIP contains Git LFS pointer text for firmware assets and does not contain the real ISO payloads.

## Confirmed issues

### Command catalog and SEO
- The catalog contains 6,161 records, but only 200 have both a summary and example; 5,961 are name-only records. A URL for a command is not a complete tutorial.
- The generator could overwrite curated pages under public/commands, and it printed fabricated "$ echo $?" / "0" output for arbitrary commands.
- Thin pages received generic options/concepts, unverified distro tables, and misleading related links.
- Fix applied: preserve curated page output, only index records with a summary and example (curated pages remain eligible), omit thin records from the sitemap, remove fabricated output, and gate unverified detail sections.
- The supplied snapshot's command sitemap after this policy contained 228 URLs (static routes plus eligible command records). Confirm generated counts in CI after every data change.

### Tutor model contract
- The Tutor model pin validator requires repository@immutable-revision, but old deployment documentation referenced a provider-suffixed model string. This can make the Tutor fail closed with 503.
- The configuration now targets Qwen/Qwen3-8B pinned to revision b968826d9c46dd6066d109eabc6255188de91218. Verify this exact identifier with the chosen Hugging Face provider in staging before relying on it in production.
- Certificate grading and signed issuance must remain deterministic. The model can explain study material or feedback, but must not choose pass/fail or sign credentials.

### Binary artifacts and VM boot
- BIOS assets in the supplied ZIP were Git LFS pointer files; the LFS preflight therefore failed in that environment. Ensure production/build checkouts run git lfs pull and validate exact sizes and SHA-256 before deploying.
- The Developer Alpine image is declared as 691,011,584 bytes (about 659 MiB), far larger than Alpine virt (~49 MiB) and linux4 (~7.4 MiB). Cold cache, interrupted chunks, browser storage quota, memory copies, proxy timeouts, and boot timeouts need distinct handling.
- A real guest boot could not be proven without hydrated firmware and actual ISO payloads.

### Delivery topology
- /api/iso/linux4 is a Netlify Edge proxy to the Cloudflare Worker. /api/v86-firmware is a Netlify Edge route that reads static same-origin firmware assets. The Cloudflare Worker is the large-image delivery/cache layer and supports GitHub Releases/Hugging Face origins.
- Keep the boundaries explicit; avoid a second hop for large images unless it provides measured value. Origin is CORS policy, not authentication. Confirm the actual client IP survives proxying before relying on IP-based rate limits.
- Prefer Cloudflare R2 as a stable primary ISO origin if configured, while retaining tested GitHub Releases and Hugging Face fallbacks.

### SEO/E-E-A-T claims
- The snapshot contains /about/ and homepage structured data, so "no About page or schema" is not accurate for the supplied snapshot. A truthful founder Person entity and page-specific metadata/schema remain potential improvements.
- The snapshot contains nine tutorials; more intent-focused, genuinely useful lessons are needed for chmod/permissions, grep, ls, and related searches.
- Backlinks cannot be verified from repository contents. Check Search Console and independent backlink tools; do not invent backlink counts.
- Certification is linked from navigation and sitemap in the snapshot. Keep question counts, visible copy, metadata, and assessment behavior consistent.

### Video pipeline, ads, and privacy
- Added a code-only FFmpeg slide generator with validated JSON input, text-file based drawtext (expansion=none), no shell execution, and ffprobe output validation. It requires ffmpeg/ffprobe at runtime; narration is not synthesized.
- Prefer a first-party sponsor card after learning content. Do not inject ads into the terminal, VM viewport, boot flow, login, certificate assessment, or error dialogs.
- A browser VM avoids running the guest kernel on a shared server but is not a perfect sandbox. Browser, renderer, WASM, v86, APIs, artifacts, and isolation policy remain security-relevant.

## Test evidence and limits
Passed in the supplied ZIP snapshot: artifact manifest, certificate contract, command count, content contract, coverage threshold, CSP report, GitHub Actions pinning, ISO builder contract, Cloudflare Worker contract, tutorial content, Netlify Edge contract, P2/P3 contract, Phase 2 SEO contract, quiz quality, real-guest firmware-proxy contract, release security, static security, and site routes.

Not completed or not runnable in that snapshot: npm ci, complete npm run test:ci, TypeScript build, browser/mobile/accessibility/production smoke tests, dist-dependent route/security checks, real ISO boot, hydrated LFS asset validation, live provider test, live CSP/COEP/COOP and cache/range tests, Search Console review. A failed test caused by missing dist/ or LFS hydration is evidence to fix the verification environment, not proof that production is broken.

## Required production gates
1. Hydrate firmware/ISO artifacts and verify declared sizes and SHA-256.
2. Run full CI and build on the exact commit.
3. Exercise Alpine virt and Developer Alpine on cold/warm cache and constrained mobile, including interruption, quota, retry, and reset.
4. Verify the Qwen provider identifier and authenticated Tutor request in staging.
5. Verify live CORS, CSP/COEP/COOP, Range, cache, and artifact integrity behavior.
6. Check Search Console after the sitemap change and monitor excluded/indexed counts.
7. Keep a tested rollback target. Do not claim all runtime issues are fixed until these gates pass.


## Re-audit follow-up: current main CI

The current main commit's GitHub Actions run was inspected. `npm run test:ci` failed in `tests/release-security-contract.test.mjs` because `docs/PRODUCTION_SECURITY_BOUNDARY.md` omitted two explicit security-boundary statements required by the existing contract: that a browser VM is not equivalent to a server-side microVM, and that hostile-workload isolation remains blocked pending server-side CPU/process/filesystem isolation. The boundary document is corrected in the re-audit commit. This failure demonstrates that the previous commit was not fully CI-verified. CI must be rerun against the new commit; passing is not assumed.

The mixed `.mjs` and `.test.ts` test files are invoked explicitly by `package.json` using Node's native test execution / TypeScript stripping rather than a single test-runner discovery mechanism. The extension mix alone is not proof of a defect. Any migration must update all script references and preserve runtime behavior; a mass rename without that migration would create more risk than it removes.

The current homepage has Organization/WebSite/Course/FAQ structured data and links to About and certification; the About page exists. No founder identity should be invented: add Person schema only after the site owner confirms the public name and role. Repository content cannot establish backlink counts or Google ranking positions. Those require Search Console and external backlink data.


## Re-audit finding: Developer Alpine chunk URL mismatch and integrity status

The v86 `use_parts` API appends `-<start-byte>-<end-byte>` to its configured URL. The Developer Alpine configuration ended in `developer-<sha256>`, so v86 requests paths shaped like `/developer-<sha256>-<start>-<end>`, while the Worker originally only accepted `/developer-<start>-<end>-<sha256>`. This format mismatch would make lazy Developer Alpine chunk requests fail. The Worker now accepts both formats and validates the digest and offsets in either layout; a regression contract was added.

A separate integrity limitation was also confirmed: the lazy Developer Alpine path avoids downloading the full 659 MiB ISO before VM initialization, but the Worker checks upstream range metadata and byte counts rather than a trusted hash for every chunk. The old UI marked this path `verified` before v86 fetched the chunks, which overstated verification. The UI now marks lazy Developer Alpine as integrity-unverified and says so in diagnostics. Full cryptographic integrity for lazy loading remains gated on a release-generated per-chunk digest manifest; do not claim the streamed image is fully SHA-256 verified until that control exists and is tested. The standard buffered Alpine Virt and linux4 paths retain full-image verification.


## Remaining-issue remediation: CI syntax and Developer Alpine integrity

The previous CI run stopped because the generated-page validator contained literal backslashes before template literals. Those escapes are removed and the validator is included in the build-syntax check.

The Developer Alpine lazy path now has a release-time integrity pipeline. `scripts/generate-iso-chunk-manifest.mjs` streams the exact pinned GitHub Release ISO, verifies its full size and SHA-256, and emits a 32 MiB per-chunk SHA-256 manifest. The Cloudflare deployment workflow generates this manifest before bundling the Worker. The Worker validates manifest completeness, requires exact chunk boundaries, hashes each Developer Alpine chunk before caching or serving it, and exposes a digest-pinned manifest endpoint. The browser checks that endpoint before boot and fails promptly if it is unavailable rather than waiting for a VM timeout. Lazy streaming still does not mean the entire ISO has been downloaded and hashed in the browser, so the UI keeps the whole-ISO integrity state unverified.

The checked-in manifest is an intentionally invalid placeholder. Production Worker deployment must run the generator against the pinned ISO first; a source-only commit does not establish that the production Worker has been deployed or that real guest boots pass.
