# LinuxTerminal

LinuxTerminal is a free, beginner-focused Linux learning platform: tutorials, a searchable command reference, safe browser practice, challenges, quizzes, contextual tutoring, a temporary real Linux lab, and a free verified assessment.

## Security boundary

Before deployment, read [`THREAT_MODEL.md`](./THREAT_MODEL.md). The browser simulator and the real v86 Linux guest are educational browser environments. The real Linux VM is **not a host-kernel security boundary** and must not be represented as a multi-tenant hostile-workload sandbox. Browser/runtime limits are defense-in-depth controls; guest telemetry is observational. A deployment that requires hostile arbitrary-code isolation needs an independently enforced server-side sandbox.

## Start learning

- Homepage: https://linuxterminal.me/
- Tutorials: https://linuxterminal.me/learn/
- Beginner path: https://linuxterminal.me/beginner/
- 200+ command reference: https://linuxterminal.me/commands/
- 100 challenges: https://linuxterminal.me/challenges/
- 500-question practice quiz: https://linuxterminal.me/quiz/
- Free verified exam and certificate: https://linuxterminal.me/certificate/
- Public certificate verification: https://linuxterminal.me/verify/
- Real Linux lab: https://linuxterminal.me/real-linux/

## Learning model

LinuxTerminal explains Linux concepts first, then connects each concept to command practice. Linux is a family of Unix-like operating systems built around the Linux kernel and used widely in servers, development, cloud, automation, embedded systems and security tooling.

The site is deliberately transparent: a browser simulator is an educational model, while the real Linux page runs a temporary x86 Linux guest in the browser. Neither should be described as a host-kernel security boundary.

### Tutorials

Crawlable tutorials cover Linux basics, terminal navigation, files and directories, permissions, processes, shell scripting and text processing. They lead learners toward command lessons and practical exercises.

### Command reference

The canonical catalog contains 200+ crawlable command lessons. Important commands have dedicated URLs such as `/commands/cd/`, `/commands/pwd/`, `/commands/ls/`, `/commands/grep/`, `/commands/chmod/` and `/commands/gcc/`.

Each lesson explains purpose, starter syntax, behavior and safe practice. A reference page does not imply that every command is implemented by the educational simulator.

### Challenges

There are 100 challenges across 50 core commands. Every command has a prediction-and-verification task and a reasoning/change task. Learners are asked to predict stdout, stderr and exit status before running a command, then explain the observed evidence.

### 500-question practice quiz

The practice bank contains 500 command-specific questions generated from 50 curated command fact records. It tests purpose, syntax, options, expected results, failure conditions, command selection, stdout/stderr, exit status and safe experimentation. Question order and answer-choice order are randomized for every session and reset.

The practice quiz is browser-local and is not treated as a credential.

## Free verified assessment and certificate

The verified assessment is free. A signed-in user starts a server-created exam attempt. The server chooses and randomizes 30 questions and their choices, stores the answer key in Upstash Redis, grades the submitted answers server-side, and requires 80% to pass.

A passing attempt creates a unique certificate ID and a server-signed record containing the exact score, percentage, issue date and assessment version. The public verification page checks the stored record and signature.

The credential is a **LinuxTerminal Certificate of Completion** for this educational assessment. It is not an accredited professional certification.

Required Netlify environment variables:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `CERTIFICATE_SIGNING_SECRET`

Never commit the signing secret.

## AI Tutor

The protected Tutor edge function defaults to `Qwen/Qwen3-8B:nscale` through `HF_MODEL`. `HF_TOKEN` stays server-side. Learner context is treated as untrusted data, requests are authenticated, and Upstash rate limiting fails closed when unavailable. A deterministic teaching fallback is used if the model is unavailable.

Tutor variables:

- `HF_TOKEN`
- `HF_MODEL` (optional; defaults to `Qwen/Qwen3-8B:nscale`)
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `TUTOR_ALLOWED_ORIGINS` (optional)

## Integrity and security

VM artifacts are pinned to exact SHA-256 digests and sizes. The ISO relay validates release metadata before streaming, while the browser validates every requested range and incrementally computes the complete-artifact SHA-256 digest while assembling large images. The final digest and exact size must match the pinned artifact before the ISO is accepted.

CSP, security headers, authenticated Tutor access, server-side exam grading, signed certificates, bounded browser storage, resource limits and regression tests are part of the production design.

Guest telemetry is UX-only and is not used as proof of isolation or host safety. Real VM controls are defense-in-depth browser controls, not a host-kernel sandbox.

## SEO and crawlability

The site publishes robots.txt, a generated sitemap, canonical URLs, page-specific descriptions, crawlable tutorials, dedicated command lessons, challenge pages, quiz pages and public certificate verification. The sitemap is generated from the same command catalog used by the command reference so URLs remain aligned.

## Networking and cybersecurity roadmap

Networking and cybersecurity learning will be added later as extensions of the Linux command curriculum. The current site does not claim to be a complete networking or cybersecurity lab.

## Development

Requirements: Node.js 22+ and npm 10.8+.

```bash
git clone https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid.git
cd linuxlab-hybrid
npm ci
npm run dev
```

Build with `npm run build`.

Run the full CI-oriented checks with `npm run check`. Production smoke testing uses `npm run test:production -- https://linuxterminal.me`.

The repository uses strict TypeScript, reproducible npm installs, pinned CI action commits, automated dependency-update configuration, explicit code ownership, and regression tests for the learning engine, command catalog, parser, assessment runtime, ISO integrity, edge behavior, storage/resource controls, tutorials, quiz quality, certificate contracts and production routes.

## License

See `LICENSE` and `NOTICE`.


### Container-terminal status

The former Docker-backed `container-terminal` service has been removed from this repository. There is no publicly deployable WebSocket/Docker terminal backend in the current tree; therefore its historical authentication, Origin, quota, identity, image-pinning, Docker-host, and lockfile findings are intentionally resolved by removal rather than by exposing an unsafe service. Do not reintroduce such a backend without authentication, Origin allowlisting, per-user/IP quotas, immutable image and dependency pins, isolated Docker privileges, and host-level sandboxing.


## Data minimization
Learning progress does not collect or retain a learner's birthday or other unnecessary date-of-birth information.

## Release governance
Production deployment requires the GitHub `production` environment, required review/protection rules, and retained CI security/dependency reports. These repository-administration controls must be enabled in GitHub settings.
