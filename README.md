# LinuxTerminal

LinuxTerminal is a free, beginner-focused platform for learning Linux through explanations, tutorials, command references, safe browser practice, challenges, quizzes and an optional real Alpine Linux lab.

## Start learning

- Homepage: https://linuxterminal.me/
- Beginner path: https://linuxterminal.me/beginner/
- Tutorials: https://linuxterminal.me/learn/
- 200+ command reference: https://linuxterminal.me/commands/
- 100 challenges: https://linuxterminal.me/challenges/
- 500-question practice quiz: https://linuxterminal.me/quiz/
- Free verified assessment and certificate: https://linuxterminal.me/certificate/
- Public certificate verification: https://linuxterminal.me/verify/
- Real Linux lab: https://linuxterminal.me/real-linux/

## Why LinuxTerminal

Linux is used across servers, development, cloud infrastructure, automation, embedded systems and cybersecurity. LinuxTerminal teaches the command line first because command-line reasoning transfers across distributions and environments.

LinuxTerminal combines crawlable lessons with safe practice: learn a concept, read a command lesson, predict stdout/stderr and exit status, run it, explain the result, then test yourself.

The simulator is an educational model and is not a full Linux kernel. The real browser lab uses temporary x86 Linux guests and should not be treated as a host-kernel security boundary. Never enter real passwords, API tokens or private keys into the browser lab.

## Tutorials and command reference

The site includes crawlable tutorials for Linux basics, navigation, files and directories, permissions, processes, shell scripting and text processing.

The canonical command catalog contains 200+ command lessons. Important command URLs include `/commands/cd/`, `/commands/pwd/`, `/commands/ls/`, `/commands/grep/`, `/commands/chmod/` and `/commands/gcc/`. The reference catalog is intentionally broader than the simulator's executable subset: a lesson does not imply that every command is emulated.

## Challenges and quiz

There are 100 challenges across 50 core commands. Each command has a prediction/verification task and a reasoning task. Challenge progress is browser-local.

The 500-question practice assessment contains command-specific questions about purpose, syntax, options, expected results, realistic failures, stdout, stderr, exit status and safe experimentation. Question order and answer choices are randomized for every session and reset. The practice score is not a credential.

## Free verified Linux certificate

The verified assessment is free. Sign-in is required so the server can bind an attempt to an account.

1. The server creates a randomized exam attempt.
2. The browser receives questions and submits answers, not a claimed score.
3. The server grades the attempt and calculates the exact score.
4. 80% or higher is required to pass.
5. A passing result receives a unique certificate ID.
6. The server signs and stores the certificate record in Upstash Redis.
7. Anyone can verify the certificate ID publicly.

The certificate contains the exact score, percentage, issue date and assessment version. It is a **LinuxTerminal Certificate of Completion**, not an accredited professional certification.

Required Netlify environment variables for the verified certificate service:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `CERTIFICATE_SIGNING_SECRET`

Never commit the signing secret or Upstash token.

## AI Tutor

The contextual AI Tutor is protected by Netlify Identity and the `/api/tutor` edge function. The default model is `Qwen/Qwen3-8B:nscale`; override it with `HF_MODEL` if needed. `HF_TOKEN` remains server-side.

Tutor rate limiting uses authenticated user plus trusted client identity in Upstash Redis and fails closed if the limiter is unavailable. If the model is unavailable, the service uses a deterministic educational fallback. Learner context is treated as untrusted data and cannot override system instructions.

Required Tutor variables:

- `HF_TOKEN`
- `HF_MODEL` (optional; defaults to `Qwen/Qwen3-8B:nscale`)
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `TUTOR_ALLOWED_ORIGINS` (optional)

## Artifact integrity

Linux VM artifacts are pinned to exact SHA-256 digests and byte sizes. The edge relay validates the requested artifact against the trusted release manifest, while the browser verifies the complete artifact before accepting it. Range requests are validated and resumable downloads do not require buffering the complete ISO in the edge function.

## Networking and cybersecurity roadmap

Networking and cybersecurity learning are planned as later extensions. The current project does not claim to be a complete networking or cybersecurity lab. Future material will remain educational, defensive and isolated from real-world targets.

## SEO and crawlability

The project publishes `robots.txt`, a sitemap, crawlable tutorials, dedicated command lessons, challenge and quiz pages, canonical URLs and page-specific descriptions. The sitemap is generated from the canonical command catalog so command URLs remain aligned with the reference.

## Development

Requirements: Node.js 22+ and npm 10.8+.

```bash
git clone https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid.git
cd linuxlab-hybrid
npm ci
npm run dev
```

Build and tests:

```bash
npm run build
npm test
npm run check
npm run test:production -- https://linuxterminal.me
```

CI also runs the quiz-quality and certificate-contract regression checks.

## Security boundary

Engine A limits are enforced by the simulator itself. Real-Linux browser controls are defense-in-depth lifecycle controls, not a host-kernel isolation boundary. Guest CPU, memory, process and filesystem telemetry is UX-only and is not used as proof of security or host resource enforcement.

## License

See `LICENSE` and `NOTICE`.
