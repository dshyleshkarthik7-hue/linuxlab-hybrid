# Deployment and runtime source of truth

## Canonical branch

`main` is the only production/deployment branch. Feature and audit branches must not be configured as Netlify production deploy targets.

## v86 runtime source of truth

The browser VM runtime is owned by:

- `src/main-v86.ts` — VM lifecycle and guest readiness
- `src/v86-entry.ts` — static runtime loading
- `src/core/ISOIntegrity.ts` — pinned ISO metadata and verification
- `src/core/verified-iso-fetch.ts` — same-origin verified ISO delivery
- `netlify/edge-functions/iso.ts` — streaming ISO proxy

The runtime is considered initialized only after v86 emits `emulator-ready`; VM construction alone is not readiness.

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

## Tutor abuse protection

When deployed, configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for durable distributed rate limiting. The edge function retains an in-memory fallback only for environments where the durable limiter is unavailable.
