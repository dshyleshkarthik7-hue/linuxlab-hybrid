# Phase 3 — release readiness, security, and operations

This runbook is the release operator's checklist for LinuxTerminal. It complements automated tests; it does not replace a human security review or live deployment verification.

## GO / NO-GO

A release is **NO-GO** if any of the following is true:
- The exact commit has not passed push-triggered CI on `main`.
- A high/critical dependency or secret-scan finding is unresolved without a documented, approved exception.
- Lint, server/edge type checks, contract tests, build, artifact-manifest validation, browser smoke, real-guest checks, mobile checks, or cross-browser accessibility checks fail.
- The build's `build-info.json` commit does not equal the intended release SHA.
- Production smoke fails security headers, hostile-origin rejection, certificate/tutor endpoint behavior, ISO range/integrity, or cache-isolation probes.
- Required production environment variables or durable rate-limit dependencies are absent or unhealthy.
- The browser guest is being represented as a hostile-workload security boundary. It is not one.

### Before release
1. Confirm the exact target SHA and a clean, reviewed diff.
2. Run `npm ci`, `npm run lint`, `npm run typecheck:server`, `npm run typecheck:functions`, `npm run test:ci`, and the browser/accessibility gates used by CI.
3. Confirm the artifact manifest pins release URLs, exact byte sizes, and SHA-256 hashes; verify generated chunk manifests cover the whole artifact with no gaps.
4. Run `npm run release:preflight` with approved production environment variables. The preflight must not print secret values.
5. Inspect the generated SBOM and dependency-audit artifact; resolve or record approved exceptions before deploying.
6. Verify deployment credentials are limited to required projects and use protected GitHub environments.
7. Deploy only the exact commit whose push CI passed. Cloudflare's workflow requires explicit manual confirmation and refuses stale main SHAs.

### After deployment
1. Run the production smoke workflow with the expected commit SHA. HTTP 200 alone is not a health signal.
2. Verify security headers and page-specific CSP; confirm hostile origins do not receive permissive CORS headers.
3. Verify tutor/certificate endpoints fail closed when authentication, provider, or durable rate-limit services are unavailable.
4. Verify ISO chunk range, byte count, digest metadata, origin-separated cache keys, and artifact-manifest provenance.
5. Check monitoring for elevated 4xx/5xx rates, tutor provider failures, rate-limit backend failures, CSP violations, ISO failures, and certificate issuance/verification failures.
6. Record the SHA, workflow links, test results, exceptions, operator, deployment time, and rollback decision.

## Rollback procedure

1. **Stop further promotion.** Disable pending deploys; do not start a second deployment while diagnosing the first.
2. Identify the last known-good SHA and its successful CI run. Confirm its build artifact/provenance and deployment record.
3. For Netlify, restore the last known-good immutable deploy using deploy history. For Cloudflare, redeploy the last known-good worker commit through the guarded workflow; never bypass exact-SHA checks.
4. If credentials may be exposed, revoke/rotate them before restoring service. Confirm rollback will not re-enable a compromised secret or unsafe configuration.
5. Run production smoke against the restored deployment and verify `build-info.json` reports the expected SHA.
6. Monitor error rates and affected endpoints. Keep the incident open until the cause is understood and a regression test is committed.

Do not roll back only static files while leaving an incompatible worker or API version deployed; coordinate website, edge functions, ISO worker, and data schema.

## Incident response

1. Triage severity, user impact, first-known time, affected commit/deploy, and affected services.
2. Preserve request IDs, sanitized logs, workflow runs, CSP reports, and deployment metadata. Never copy tokens, learner prompts, private keys, or sensitive personal data into public issues.
3. For suspected secret exposure, revoke/rotate the credential first, identify its scope, and review audit logs. Removing a secret from the current tree does not erase it from Git history.
4. For abuse/cost spikes, restrict the affected endpoint using platform controls, verify durable rate limiting and provider circuit breakers, and monitor before re-enabling.
5. For ISO integrity failures, stop serving the artifact, invalidate affected caches, compare source release bytes with the trusted manifest, regenerate chunk hashes, and verify a complete download before restoring service.
6. For suspected VM escape or hostile guest execution, treat the host/browser as potentially exposed, preserve evidence, stop advertising the feature as safe for hostile workloads, and require independent assessment before reopening the affected execution path.
7. Record timeline, impact, root cause, containment, recovery, and a regression test.

## Key rotation

- Store secrets only in the platform secret store or protected CI environment.
- For certificate signing, add the new key ID and secret to the verification keyring first, switch the active key ID, verify issuance and old/new certificate validation, then retire the old key only after the compatibility window.
- Rotate Redis, MongoDB, AI provider, Netlify, and Cloudflare credentials independently; grant least privilege and verify replacement credentials before revoking old ones.
- Never echo environment values. Preflight must print presence/validation status only.
- Record operator, key ID (never secret), rotation time, validation result, and rollback plan.

## Performance, accessibility, and compatibility gates

- CI runs browser smoke, real-guest checks, mobile checks, and cross-browser keyboard/accessibility checks. The tutor page is included in the accessibility route matrix.
- Check reduced motion, visible keyboard focus, form labels, live-region feedback, mobile overflow, and route-specific CSP after UI changes.
- Track page load and VM startup, ISO fetch/retry duration, memory use, API latency, provider failures, and cache hit ratio. Set budgets from measured baselines rather than invented thresholds.
- Test constrained-memory devices and supported browsers before claiming universal support.

## External review still required

Automated contracts are regression guards, not proof of exploit resistance. Before using the platform for hostile workloads or claiming production-grade isolation, obtain independent review of:
- browser/emulator escape and guest-to-host communication;
- resource exhaustion and lifecycle cleanup;
- authentication, authorization, CORS/CSP, and message validation;
- ISO delivery/cache isolation and supply-chain provenance;
- certificate key management, abuse controls, and persistence;
- privacy, retention, and incident handling.

The security boundary documentation remains authoritative: browser VM controls are defense in depth, not server-side CPU/process/filesystem isolation. This phase does not turn the guest into a hostile-code sandbox.
