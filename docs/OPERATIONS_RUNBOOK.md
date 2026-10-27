# Operations and recovery runbook

This runbook describes safe, evidence-based response steps. Do not claim an incident is resolved until the recovery checks below pass.

## Release and rollback

1. Identify the exact deployed commit from `/build-info.json`; record the response and deployment timestamp.
2. Require a successful push-triggered CI run for that exact commit. The Cloudflare deployment workflow enforces this gate and refuses stale `main` commits.
3. Before deploying the Cloudflare ISO worker, generate the Developer Alpine chunk manifest from the pinned GitHub Release asset. The generator validates the full asset size and SHA-256 before writing per-chunk digests. Never hand-edit or invent chunk hashes.
4. Confirm the generated manifest contains contiguous, non-overlapping chunks, each with a 64-character lowercase SHA-256, covering exactly the pinned artifact size.
5. Run the deployment workflow only after explicit production approval and configured Cloudflare credentials are available.
6. Run the production smoke workflow. It defaults the expected deployment SHA to the workflow's checked-out commit and verifies `/build-info.json` reports that exact SHA; an explicit SHA may be supplied for a deliberate rollback verification. The smoke test also requires the live Developer Alpine chunk manifest to contain real, contiguous SHA-256 entries covering the pinned release size.
7. If a smoke test fails, stop further deployment. Roll back through the hosting provider's known-good deployment/version mechanism, then repeat the same commit, header, and ISO probes against the rollback.

## ISO integrity or download incident

1. Keep Developer Alpine chunk delivery disabled when the checked-in manifest is a template or any digest is missing. The Worker must fail closed.
2. Compare release asset size and SHA-256 with `artifacts/manifest.json`; generate the chunk manifest only from that exact trusted asset.
3. Probe byte-range boundaries, malformed and unsatisfiable ranges, truncation, retry, concurrent requests, and cache-key separation in staging.
4. Do not purge or repopulate caches with unverified bytes. Use immutable artifact-version/digest cache keys and verify response metadata.
5. After recovery, test a small range, a final partial chunk, and full-image assembly plus final SHA-256 before announcing service restoration.

## Certificate backend incident

1. Do not disable authorization, signature verification, rate limiting, or revocation checks as a workaround.
2. Capture request IDs, operation IDs, timestamps, and redacted dependency error classes. Never log signing keys, provider tokens, full certificate secrets, or learner private data.
3. Check Redis health and lock expiry; check MongoDB health, required indexes, uniqueness constraints, and revocation-record availability.
4. Reconcile any ambiguous submission by the stable idempotency identity (user, attempt, exam version, submission), not by blindly retrying issuance.
5. Verify signature validity and revocation status after recovery. Rotate a compromised signing key using the configured key ID/version mechanism; preserve old public verification keys for the documented retention period.
6. Test concurrent submissions, Redis-only and MongoDB-only failures, partial writes, cross-user access, retries, and key rotation in staging before closing the incident.

## AI Tutor/provider incident

1. Fail closed with a clear retryable response when provider configuration is missing or invalid; never expose provider secrets to the browser or public errors.
2. Check provider health, pinned model/revision, timeouts, response parsing, rate-limit counters, usage ceilings, and cost alerts.
3. Test empty, malformed, oversized, delayed, and failed provider responses plus prompt-injection/untrusted-context cases.
4. Verify limits are applied before expensive provider work and that concurrent clients cannot bypass identity-scoped quotas.
5. Do not increase spending ceilings or remove request limits during an incident without explicit approval.

## Security boundary and abuse

- The browser v86 VM is an educational browser environment, not a server-enforced hostile-workload sandbox. Do not use it to promise isolation for hostile multi-tenant workloads.
- If that guarantee is required, pause the affected feature until execution is moved to a separately enforced sandbox with explicit CPU, memory, process, filesystem, lifetime, and network policy.
- Treat browser-side CPU/timeout limits and guest telemetry as defense-in-depth/observability, not a security boundary.
- For abuse or suspected credential leakage, disable the affected credential/route, rotate the secret at its provider, inspect redacted logs, and validate least-privilege permissions before restoring service.

## Monitoring and alert handling

- The scheduled production smoke workflow checks the live homepage, required security headers, hostile-origin rejection, and ISO worker response behavior.
- GitHub Actions failure notifications are the baseline alert channel; repository owners should configure a monitored notification destination and ensure scheduled workflow failures are not silently ignored.
- On alert, record the workflow URL, commit SHA, failing probe, first-seen time, and last-known-good deployment. Re-run once only to distinguish transient transport failure from a reproducible regression; do not dismiss a deterministic security failure as flaky.
- Verify the monitor itself by manually dispatching it and checking the workflow result. An unconfigured external paging integration must not be described as active.

## Content and accessibility review

- Catalog inventory is not lesson coverage. Publish complete/planned/unavailable counts derived from source data, not hand-maintained totals.
- Human reviewers should record reviewer identity, review date, topic-specific accuracy notes, and corrections. Do not mark lessons reviewed based solely on structural tests or generated content.
- Run the Chromium/Firefox/WebKit smoke and axe checks on the final commit. Manually test keyboard-only navigation, visible focus, zoom/reflow, form labels, screen-reader names, and reduced motion on representative routes.
- Treat any serious/critical axe finding as a release blocker until fixed or documented as a confirmed tool false positive with reproducible evidence and an approved exception.
