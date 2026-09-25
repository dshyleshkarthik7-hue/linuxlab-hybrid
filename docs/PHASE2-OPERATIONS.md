# Phase 2 production operations

## Certificate signing-key rotation

Use CERTIFICATE_SIGNING_KEYS as a comma-separated keyId=secret keyring and CERTIFICATE_SIGNING_KEY_ID as the active key ID. Keep the previous key in the keyring while certificates signed with it remain verifiable.

Rotation: generate a new secret outside Git; add it to production secrets under a new key ID; add the keyId=secret entry to CERTIFICATE_SIGNING_KEYS; set CERTIFICATE_SIGNING_KEY_ID to the new ID; deploy and verify both an old certificate and a newly issued certificate; retire the old key only after the retention period; record only the key ID and timestamp, never the secret.

## Failure matrix

| Dependency | Production behavior |
|---|---|
| Upstash unavailable | Tutor and certificate controls fail closed with 503 |
| Mongo unavailable | Certificate service returns 503 |
| Hugging Face unavailable | Tutor circuit opens and returns 503 |
| Cloudflare ISO origin unavailable | ISO relay returns 502 and tries the next pinned origin |
| Netlify unavailable | Production smoke fails; stop promotion or roll back |
| Artifact digest mismatch | Browser/CI integrity gate blocks boot/release |

No dependency failure may silently downgrade authentication, integrity, rate limiting, or signing controls.

## Load and concurrency acceptance

Run load tests against staging, never production by default. Minimum scenarios: ISO at 10/50/100/500 concurrent range requests; Tutor at 10/50/100 concurrent authenticated requests; certificate verification at 10/50/100 concurrent public requests; certificate submission with concurrent distinct attempts and duplicate submissions for one attempt. Retain p50/p95/p99 latency, error rate, dependency saturation, Redis operations, Mongo connection usage, memory, tested commit SHA, and release decision.

## Observability

Structured operational events should cover Tutor provider failures and circuit transitions, Redis availability failures, certificate issuance/verification/persistence failures and signing key ID, ISO upstream rejection/failure and fallback selection, deployment SHA and rollback SHA. Never log tokens, signing secrets, learner answers, or full request bodies. Alert on availability, 5xx rate, dependency latency, rate-limit failures, circuit-open duration, certificate verification failures, and ISO upstream failures.

## Dependency update SLA

Dependabot runs weekly. High/critical security advisories are release blockers until fixed or explicitly risk-accepted. Routine dependency updates should be merged within 30 days when CI is green.

## Configuration source of truth

artifacts/manifest.json is authoritative for pinned VM artifacts. src/core/artifacts.ts consumes that manifest and must not contain independent URLs, sizes, or digests. Deployment workflow configuration remains in .github/workflows; application runtime configuration remains in netlify.toml and the relevant edge/function source. Tests validate contracts between these sources rather than copying operational values.

## Rollback

Every production release retains its tested commit SHA and previous known-good SHA. Rollback uses an already-tested commit; emergency changes are followed by the normal release gates.
