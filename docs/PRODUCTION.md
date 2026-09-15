# Production deployment checklist

LinuxTerminal's production architecture keeps the browser VM and the Tutor API separate. The beginner homepage is intentionally unchanged by this deployment work.

## Required Netlify environment variables

Configure these in **Netlify → Project configuration → Environment variables** for the Production scope:

| Variable | Value |
|---|---|
| `HF_TOKEN` | Your Hugging Face token with only the access required for the selected inference provider |
| `HF_MODEL` | `Qwen/Qwen3-8B:nscale` |
| `UPSTASH_REDIS_REST_URL` | Your Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Your Upstash Redis REST token |
| `TUTOR_ALLOWED_ORIGINS` | Exact production origins, for example `https://linuxterminal.me` |

Do not put `HF_TOKEN` or the Upstash token in frontend code, Git, or `VITE_*` variables. The Tutor edge function reads them server-side.

Tutor intentionally fails closed with HTTP 503 when distributed rate limiting is not configured or Upstash is unavailable.

## Hugging Face Tutor

The Tutor calls Hugging Face's OpenAI-compatible router from the Netlify Edge Function. The default model is `Qwen/Qwen3-8B:nscale`; set `HF_MODEL` explicitly in production so the deployed model choice is visible in configuration.

The browser never calls Hugging Face directly. Tutor requests require Netlify Identity authentication, use bounded request/context sizes, and apply distributed user+IP rate limiting before calling the model provider.

If the provider is unavailable, Tutor returns a small rule-based teaching fallback. This keeps the learning feature useful without exposing the provider token.

## Upstash rate limiting

Tutor uses a 12-request / 60-second window with separate authenticated-user and client-IP keys. The counter window is established only when a key is first created; later requests increment the existing window without extending its TTL.

Both the user and IP limits must pass. If Upstash cannot be reached, Tutor fails closed rather than silently switching to process-local memory.

## Netlify Identity

1. Enable Netlify Identity for the site.
2. Confirm the production site URL is the Identity site URL.
3. Choose the registration policy deliberately: open registration is appropriate for a public learning site; invitation-only is appropriate for a restricted classroom.
4. Keep the login page at `/login/` and verify that successful login returns to the Tutor.
5. Test both an authenticated Tutor request and an unauthenticated request.

The application does not invent a second authentication protocol: the browser obtains the Netlify Identity session and the Tutor verifies it server-side.

## Production smoke test

Set the GitHub Actions repository variable `PRODUCTION_BASE_URL` to the canonical deployed origin. This enables the production smoke test in CI instead of silently skipping it.

Before release, run:

```bash
npm ci
npm run test:ci
npm run test:smoke
npm run test:real-guest
npm run test:mobile
npm run test:production
```

Then manually verify:

- `/login/` loads and the Netlify Identity widget opens.
- A signed-in user can open Tutor.
- An unauthenticated Tutor request receives `401`.
- A configured production origin succeeds and an unexpected origin is rejected.
- Tutor returns a model answer with `model: Qwen/Qwen3-8B:nscale` when the provider is healthy.
- Tutor returns the guided fallback if the provider is unavailable.
- After the rate limit is reached, Tutor returns `429` with `Retry-After: 60`.
- Removing the Upstash variables causes Tutor to fail closed with `503`.
- The browser never exposes `HF_TOKEN` or the Upstash token.

## Security boundary

The browser emulator remains browser-based. Its lifecycle/resource controls are defense-in-depth and are not a host-kernel security boundary. Guest telemetry is UX-only. Do not represent the browser VM as a server-side sandbox or claim host-level resource isolation.

## UI scope

The production authentication page has been polished for accessibility, responsive layout, focus states, clear Tutor benefits, and account status. The existing beginner homepage is intentionally not modified.
