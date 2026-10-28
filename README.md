# LinuxTerminal

LinuxTerminal is a free, beginner-focused Linux learning platform: tutorials, a searchable command reference, safe browser practice, challenges, quizzes, contextual tutoring, a temporary real Linux lab, and a free verified assessment.

## Security boundary

Before deployment, read [`THREAT_MODEL.md`](./THREAT_MODEL.md). The browser simulator and the real v86 Linux guest are educational browser environments. The real Linux VM is **not a host-kernel security boundary** and must not be represented as a multi-tenant hostile-workload sandbox. Browser/runtime limits are defense-in-depth controls; guest telemetry is observational. A deployment that requires hostile arbitrary-code isolation needs an independently enforced server-side sandbox.

## Start learning

- Homepage: https://linuxterminal.me/
- Tutorials: https://linuxterminal.me/learn/
- Beginner path: https://linuxterminal.me/beginner/
- canonical command reference (6,161 catalog entries, including planned entries and name-only stubs): https://linuxterminal.me/commands/
- 30 challenge sets: https://linuxterminal.me/challenges/
- 500-question practice quiz: https://linuxterminal.me/quiz/
- Free verified exam and certificate: https://linuxterminal.me/certificate/
- Public certificate verification: https://linuxterminal.me/verify/
- Privacy policy: https://linuxterminal.me/privacy/
- Terms of use: https://linuxterminal.me/terms/
- Real Linux lab: https://linuxterminal.me/real-linux/

## Learning model

LinuxTerminal explains Linux concepts first, then connects each concept to command practice. Linux is a family of Unix-like operating systems built around the Linux kernel and used widely in servers, development, cloud, automation, embedded systems and security tooling.

The site is deliberately transparent: a browser simulator is an educational model, while the real Linux page runs a temporary x86 Linux guest in the browser. Neither should be described as a host-kernel security boundary.

### Tutorials

Crawlable tutorials cover Linux basics, terminal navigation, files and directories, text processing, permissions, processes, shell scripting, operating-system fundamentals and networking fundamentals. Each lesson uses an observation-first learning loop: understand the model, predict the result, run one small experiment, inspect evidence, and explain what changed.

### Command reference

The canonical catalog contains 6,161 entries; this is a reference-catalog count, not a count of fully authored lessons. The current catalog has 26 complete entries, 174 planned entries, and 5,961 entries without lesson status/content. Only entries with authored teaching content should be presented as lessons. Important commands have dedicated URLs such as `/commands/cd/`, `/commands/pwd/`, `/commands/ls/`, `/commands/grep/`, `/commands/chmod/` and `/commands/gcc/`.

Completed lessons explain purpose, starter syntax, behavior and safe practice. Planned and name-only catalog entries are reference stubs, not complete lessons. A reference page does not imply that every command is implemented by the educational simulator.

### Challenges

There are 30 challenge sets across selected command topics, plus operating-system and networking questions. Challenge coverage is not a guarantee that every catalog entry has a dedicated prediction-and-verification task or a reasoning/change task. Learners are asked to predict stdout, stderr and exit status before running a command, then explain the observed evidence.

### 500-question practice quiz

Each practice session selects up to 500 questions from a generated bank built from catalog entries that have authored summaries or examples, plus operating-system and networking questions. Catalog stubs without teaching content are excluded. Coverage varies by available authored content; it is not a claim that every catalog entry is tested. Question and answer-choice order are randomized for every session and reset.

The practice quiz is browser-local and is not treated as a credential.

## Free verified assessment and certificate

The verified assessment is free. A signed-in user starts a server-created exam attempt. The server chooses and randomizes 30 questions from a curated Linux-foundations assessment bank, validates question IDs, distinct answer choices, and answer-leakage rules, stores the answer key in Upstash Redis, grades submitted answers server-side, and requires 80% to pass. The current assessment version is `linux-foundations-2.3`.

A passing attempt creates a unique certificate ID and a server-signed record containing the exact score, percentage, issue date and assessment version. The public verification page checks the stored record and signature.

The credential is a **LinuxTerminal Certificate of Completion** for this educational assessment. It is not an accredited professional certification.

Required Netlify environment variables:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `CERTIFICATE_SIGNING_KEYS` — comma-separated `keyId=secret` keyring
- `CERTIFICATE_SIGNING_KEY_ID` — active signing key ID
- `MONGODB_URI`
- `MONGODB_DB` (optional; defaults to the configured certificate database)

Never commit secrets.

## AI Tutor

The protected Tutor and certificate feedback functions use the Hugging Face Inference Providers router model ID `Qwen/Qwen3-8B`. The OpenAI-compatible router documents repository model IDs and provider-selection suffixes, but not an immutable repository-revision pin in this request format; provider-side model revisions may change. `HF_MODEL` is accepted only when it matches this router model ID. `HF_TOKEN` stays server-side. Learner context is treated as untrusted data, requests are authenticated, and Upstash rate limiting fails closed when unavailable. A deterministic teaching fallback is used if the model is unavailable.

Tutor variables:

- `HF_TOKEN`
- `HF_MODEL` (optional; defaults to `Qwen/Qwen3-8B` and must match that model ID)
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `TUTOR_ALLOWED_ORIGINS` (optional)

## Authentication and account security

The application currently uses Netlify Identity for authenticated learner accounts and server-side user verification. **Netlify Identity remains a supported Netlify authentication option as of October 2026**, so a forced migration is not required. Keep the existing provider rather than introducing an unconfigured replacement that could invalidate accounts or weaken authorization. Reconsider a migration only if the product needs capabilities that Identity does not provide; any future migration must preserve existing user IDs/ownership, verify tokens server-side, and be tested on a Deploy Preview before production rollout.

Official status and documentation: https://www.netlify.com/blog/auth0-extension-identity-changes/ and https://docs.netlify.com/manage/security/secure-access-to-sites/identity/overview/.

## Integrity and security

VM artifacts are pinned to exact SHA-256 digests and sizes. The ISO relay validates release metadata before streaming, while the browser validates every requested range and incrementally computes the complete-artifact SHA-256 digest while assembling large images. The final digest and exact size must match the pinned artifact before the ISO is accepted.

CSP, security headers, authenticated Tutor access, server-side exam grading, signed certificates, bounded browser storage, resource limits and regression tests are part of the production design.

Guest telemetry is UX-only and is not used as proof of isolation or host safety. Real VM controls are defense-in-depth browser controls, not a host-kernel sandbox.

## SEO and crawlability

The site publishes robots.txt, a generated sitemap, canonical URLs, page-specific descriptions, crawlable tutorials, dedicated command lessons, challenge pages, quiz pages and public certificate verification. The sitemap is generated from the same command catalog used by the command reference so URLs remain aligned.

## Operating-system and networking learning

The tutorial path now includes dedicated operating-system and networking fundamentals. Networking lessons explain interfaces, addressing, routing, DNS, ports, TCP and HTTP. The browser real-Linux guest intentionally has networking disabled; live network experiments should be performed on a Linux system and network the learner is authorized to use. The platform is an education environment, not a general-purpose network testing service.

## Development

Requirements: Node.js 22+ and npm 10.8+.

```bash
git clone https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid.git
cd linuxlab-hybrid
npm ci
npm run dev
```

Build with `npm run build`. The ISO builder is cross-platform at the launcher level: Linux/macOS/WSL use the Bash builder; Windows uses PowerShell/WSL.

Run the full CI-oriented checks with `npm run check`. Production smoke testing uses `npm run test:production -- https://linuxterminal.me`.

The repository uses strict TypeScript, reproducible npm installs, pinned CI action commits, automated dependency-update configuration, explicit code ownership, and regression tests for the learning engine, command catalog, parser, assessment runtime, ISO integrity, edge behavior, storage/resource controls, tutorials, quiz quality, certificate contracts and production routes.

## AI-assisted curriculum production

# Free-tier AI model strategy and measurable pilot

## Zero-cost default

The curriculum factory routes through **Gemini free tier → OpenRouter free-model router**. It uses only:
- `gemini-3.1-flash-lite` (allowlisted free-tier model; the Google project must have billing disabled);
- `openrouter/free` or an explicitly `:free` model ID.

A provider quota failure advances to the next configured free provider. If all free routes are exhausted, the batch fails and is resumable; it does not switch to a paid model. Free quotas, model routing and availability can change. Google free-tier data may be used to improve Google's products, so do not send secrets, private learner data, or unpublished sensitive content.

Hugging Face routed inference is intentionally excluded from the default route because free-account credits are small and routing can be billable. It can only be enabled by explicitly setting both `AI_ALLOW_HF_ROUTER=1` and `HF_ROUTER_BILLING_DISABLED=1` after verifying billing is disabled in that account. The factory does not make paid requests intentionally.

## Configure GitHub Actions

Add repository Actions secrets:
- `GEMINI_API_KEY`: Google AI Studio key for a project with billing disabled.
- `OPENROUTER_API_KEY`: OpenRouter key; use only `openrouter/free` or `:free` model IDs.

The workflow supports `provider=auto`, `provider=gemini`, and `provider=openrouter`. Use `auto` for normal fallback. To compare providers, run the pilot once per provider so each output is saved in a separate artifact folder. Missing keys or exhausted quotas should fail visibly, never silently switch to paid inference.

## Pilot protocol

### Stage A — small paired comparison
Run the `Curriculum Factory` workflow with `target=pilot` once with `provider=gemini` and once with `provider=openrouter`. Each run drafts the same five representative command lessons and two tutorials into an isolated `artifacts/ai-pilot/<provider>/` directory. This is a low-cost screening sample, not a quality claim.

### Stage B — validation set on the winner
After choosing a provider from Stage A, run the ordinary authoring queues on a **20-command validation set and five complete tutorials**. Include easy, common commands; complex text/process tools; GNU-vs-BusyBox differences; and potentially destructive commands that must be documented with safe examples only. Do not run dangerous examples.

### Score every artifact

Two reviewers should independently score each item from 0–2 in each category (0=fail, 1=partial, 2=strong):
1. Factual correctness against an authoritative man page or upstream manual.
2. Topic-specific depth and clarity; no filler/template reuse.
3. Syntax/options and portability boundaries accurately qualified.
4. Examples are safe, reproducible, and expected behavior is not fabricated.
5. Quiz/exercise answer correctness and useful rationale.
6. Source URLs actually support the claims (not merely plausible URLs).

Maximum: 12 per item. Record scores, reviewer disagreements, provider/model, errors and latency in a CSV or spreadsheet. The winning model must achieve:
- mean score **at least 10/12**;
- **zero critical factual or safety errors**;
- at least **90%** of examples passing in a disposable Linux test harness where executable;
- **zero** duplicate/template-failure items in the validation set;
- all citations checked for sampled factual claims.

If either model misses the gate, improve prompts/schema and repeat the pilot. Never relax the correctness gate to fill the catalogue faster.

## Scale-up

1. Run bounded, resumable batches (25 commands or 10 tutorials/curriculum items maximum per workflow run).
2. Preserve each generated file as a draft; do not commit model output automatically to learner-facing pages.
3. Run `npm run audit:curriculum-quality` and the safe-command execution harness; manually review high-risk, ambiguous, and platform-specific commands.
4. Publish only after source verification, example test evidence, duplicate checks, human approval, and build/route tests.
5. Track factual quality and verification coverage separately from raw inventory counts.

A free API quota may be too small or inconsistent to generate all 6,161 command lessons and 520+ tutorials quickly. The system pauses/fails on quota exhaustion; resume later rather than enabling billing.

The repository includes resumable, review-gated AI drafting queues for the 6,161-command catalog and the 520-item structured curriculum. They use a configurable free-tier provider adapter (Gemini free tier first, then OpenRouter's free-model router by default). Configure `GEMINI_API_KEY` and/or `OPENROUTER_API_KEY` as environment variables; never commit tokens.

- Draft up to 25 command lessons: `npm run factory:commands -- --start 0 --count 25`
- Draft up to 10 detailed tutorial lessons: `npm run factory:tutorials -- --start 0 --count 10`
- Draft up to 10 structured curriculum lessons with quizzes: `npm run factory:curriculum -- --start 0 --count 10`
- Audit generated drafts and duplication: `npm run audit:curriculum-quality`
- Require full draft coverage and no detected duplicates/placeholders: `npm run audit:curriculum-quality:strict`

Set `AI_PROVIDER_ORDER=gemini,openrouter` for automatic free-tier fallback, or `AI_PROVIDER_ORDER=gemini` / `openrouter` to test one provider. Model metadata is recorded with each draft. `GEMINI_MODEL` is restricted to allowlisted free-tier models, and `OPENROUTER_MODEL` must be `openrouter/free` or end in `:free`. Hugging Face routing is excluded by default; enabling it requires explicit acknowledgement and a verified billing-disabled account.

The **Curriculum Factory** workflow can run bounded batches or a small provider pilot and upload output as artifacts. It never publishes model output automatically. Drafts keep source candidates unverified, examples unexecuted, and human review pending. The Python quality gate reports lexical duplication, missing fields, suspiciously generic text, unsafe examples, and coverage separately. Similarity screening is triage, not proof of correctness.

**Important:** 6,161 catalog records and 520 curriculum records are inventory counts, not proof that all are accurate, tested, and human-reviewed. Do not mark AI-generated content complete until authoritative sources, implementation-specific behavior, safe examples, quiz answers, and reviewer evidence have been checked. Certificate issuance remains an assessment feature and must not imply accreditation or identity verification.

## License

See `LICENSE` and `NOTICE`.


### Container-terminal status

The former Docker-backed `container-terminal` service has been removed from this repository. There is no publicly deployable WebSocket/Docker terminal backend in the current tree; therefore its historical authentication, Origin, quota, identity, image-pinning, Docker-host, and lockfile findings are intentionally resolved by removal rather than by exposing an unsafe service. Do not reintroduce such a backend without authentication, Origin allowlisting, per-user/IP quotas, immutable image and dependency pins, isolated Docker privileges, and host-level sandboxing.


## ISO profiles and delivery

LinuxTerminal exposes three x86 images: **Linux 4** (7.4 MiB-class ultralight primary image), **Alpine Virt 3.24.1** (about 49 MiB), and **Developer Alpine v1.0.0** (about 660 MiB, optional). All are pinned by exact size and SHA-256 digest. The large Developer Alpine image is loaded by v86 in fixed 32 MiB parts so the browser does not first allocate the entire image as one pre-boot buffer. The transport worker validates every requested part and the runtime must only use the manifest-pinned artifact. This improves resumability and memory behavior; it does not turn the browser VM into a host-kernel security boundary.

## Data minimization
Learning progress does not collect or retain a learner's birthday or other unnecessary date-of-birth information.

## Release governance
Production deployment requires the GitHub `production` environment, required review/protection rules, and retained CI security/dependency reports. These repository-administration controls must be enabled in GitHub settings.


### Current deployment architecture
The browser VM uses the explicitly trusted Cloudflare ISO worker at `https://linuxterminal-iso.dshyleshkarthik7.workers.dev/`; there is intentionally no Netlify `/api/iso` Edge Function. ISO delivery uses the Cloudflare worker, while the small pinned SeaBIOS and VGABIOS files are downloaded and SHA-256 verified during the build and served as immutable static assets. Netlify remains the static application host and currently retains the authenticated Tutor/CSP/certificate application services; those services are not part of the high-volume ISO delivery path.


## Security and credential trust
The browser VM is an educational execution environment, not a hostile-code sandbox or host-kernel security boundary. Browser-side ISO SHA-256 verification protects artifact integrity in transit; it cannot make a modified client trusted.

A verified certificate proves that LinuxTerminal has an authentic signed assessment record. It does not prove presenter identity, unique authorship, invigilation, absence of collaboration, employment/university recognition, or professional accreditation.