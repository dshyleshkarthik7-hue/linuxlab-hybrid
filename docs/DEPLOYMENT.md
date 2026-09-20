# Deployment and runtime source of truth

## Canonical branch

`main` is the only production/deployment branch. Feature and audit branches must not be configured as Netlify production deploy targets.

The browser VM uses the same-origin `/api/iso` Netlify Edge Function as its canonical production ISO endpoint. The Cloudflare ISO worker is not part of the browser VM request path.

## v86 runtime source of truth

The browser VM runtime is owned by:

- `src/main-v86.ts` — VM lifecycle and guest readiness
- `src/v86-entry.ts` — static runtime loading
- `src/core/ISOIntegrity.ts` — pinned ISO metadata and verification
- `src/core/verified-iso-fetch.ts` — same-origin verified ISO delivery
- `netlify/edge-functions/iso.ts` — same-origin, range-validated ISO relay

The runtime is considered initialized only after the v86 lifecycle readiness checks complete. Guest identity and telemetry remain untrusted observations.

## Required deployment checks

Before promoting changes to `main`, run:

```text
npm run test:ci
npm run test:smoke
npm run test:real-guest
npm run test:mobile
npm run test:production
```

`npm run test:all` is the aggregate command for these checks.

## Tutor production configuration

Configure these Netlify Production environment variables:

```text
HF_TOKEN=<server-side Hugging Face token>
HF_MODEL=Qwen/Qwen3-8B:nscale
UPSTASH_REDIS_REST_URL=<Upstash REST endpoint>
UPSTASH_REDIS_REST_TOKEN=<Upstash REST token>
TUTOR_ALLOWED_ORIGINS=https://linuxterminal.me
```

Never expose the Hugging Face or Upstash secrets through frontend/Vite environment variables.

Tutor requires a valid Netlify Identity user and fails closed if distributed Upstash rate limiting is unavailable. The limiter is an atomic 12-request/60-second user+IP window and does not refresh an existing window on every request.

## Netlify Identity

Enable Netlify Identity for the production site and explicitly choose the registration policy (open registration for a public learning site, or invitation-only for a restricted classroom). `/login/` is the dedicated account entry point. Tutor authentication is verified server-side; no second custom authentication cookie is used.

## Production smoke gate

Set the GitHub Actions repository variable `PRODUCTION_BASE_URL` to the deployed production origin. This makes the production smoke test execute in CI instead of being silently skipped.

See `docs/PRODUCTION.md` for the complete environment-variable and verification checklist.
