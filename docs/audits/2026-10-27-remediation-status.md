# Repository remediation status — 27 October 2026

## CI failure-driven correction

The CI run for commit `d2a1bd1faab990db4dd67af16fa59d22f3fd0764` reached `test:ci` and failed because the source-contract test still expected the old digest call signature after the TypeScript-safe `digestInput.buffer` correction. The assertion now checks the actual safe implementation rather than the obsolete signature. The next CI run must verify this correction.

## Production deployment gate hardening

The Cloudflare deployment workflow now requires a completed, successful push-triggered CI run for the exact `main` commit being deployed, in addition to checking that `main` has not advanced. Previously, the workflow's “since CI passed” guard only compared commit SHAs and did not actually query CI results. A regression contract checks that deployment inspects Actions runs and requires success.

## Additional range-response hardening

The Netlify Linux 4 endpoint now buffers the bounded upstream range (the endpoint caps explicit ranges at 8 MiB), verifies the actual body byte count against the requested length, and only then returns a 206 response. Previously it validated the upstream range headers but streamed the body without checking whether the body itself was truncated. A regression contract asserts the body-length check.

## Follow-up CI re-audit

The first CI run for commit `69bfc954a599a3c546ebb7ca725f3e8b36797fe7` failed in `test:build-syntax`: `scripts/commands/build-command-pages.mjs` contained escaped template-literal delimiters, causing a SyntaxError before tests could complete. The same block also reset the canonical/Open Graph edits when normalizing the robots tag. The follow-up fix restores valid template literals and applies robots normalization to the already-updated document, preserving all SEO tag edits.

The release-security contract test passed in that CI run. The full CI run still needs to be repeated after the syntax correction.

## Changes in this commit

- Fixed the Netlify Linux 4 ISO endpoint's HTTP semantics: requests without an explicit Range now return 200; explicit byte/chunk requests return 206 and include Content-Range.
- Added full-size and SHA-256 verification before the Netlify endpoint serves a full ISO response, and before slicing an upstream 200 response into a range.
- Tightened the browser ISO range client to reject a 206 response whose ending byte is short of the exact requested end. This prevents partial chunks from being accepted and leaving zero-filled gaps in the assembled image.
- Removed the abort listener when a retry delay completes, avoiding a lingering listener after successful retry waits.
- Added source-contract regression assertions for the response status, full-artifact verification, exact range length, and retry listener cleanup.

## Important remaining limitation: Developer Alpine chunk hashes

`artifacts/developer-alpine-chunks.json` is explicitly marked `template-not-deployable` and contains empty per-chunk SHA-256 values. The Cloudflare Worker correctly fails closed for Developer Alpine while this is true. Do not populate these values with invented hashes or enable that route until the actual release artifact is downloaded, its full pinned digest and size are verified, and all chunk hashes are generated from those verified bytes. Confirm the deployment workflow refuses to publish an unready manifest.

## Verification status

The first GitHub Actions run caught a TypeScript BufferSource type mismatch in the new SHA-256 verifier; the verifier now copies bytes into an owned Uint8Array before hashing. The rerun must still pass before considering this change verified. This environment did not execute the full npm test suite locally, real ISO download, real guest boot, or production endpoint smoke tests.

## CI queue and stale-run correction

The CI concurrency policy now cancels superseded push, pull-request, and manually triggered runs while preserving scheduled runs. This prevents a hung browser-install step on an obsolete main commit from holding the queue and delaying verification of the current commit. A regression contract checks the policy.

## Catalog and internal-route re-audit

The generated-page validator now derives coverage counts from the current catalog data at validation time and prints disjoint complete, planned, and remaining-entry totals with the generated-page check. It also checks internal `/commands/...` links in every generated command page against canonical `.html` routes and their clean trailing-slash aliases, so a generated cross-link to a missing lesson fails the existing command-page CI gate. The check intentionally does not claim that every catalog record is a fully authored lesson.

This is source-level coverage and route validation. The full generation/build/test pipeline still must pass on the resulting commit before these checks are considered verified.

## Status of the prior 70-item audit register

The earlier 70-item register mixed concrete defects, suspected risks, missing regression coverage, operational validation, and product recommendations; it was not evidence of 70 independently confirmed bugs. This commit addresses the specific Linux 4 HTTP status/integrity issues and the exact-range assembly bug. The remaining items still require the code review, test evidence, deployment configuration, or external operational access listed below.

### Unresolved items

1. Generate and verify real Developer Alpine chunk hashes; keep Developer Alpine chunk delivery fail-closed until complete.
2. Re-run the previously reported `tests/release-security-contract.test.mjs` failure against the current commit and fix any remaining failure.
3. Confirm the actual production VM/guest isolation boundary; the browser v86 guest is not a hostile-workload security boundary.
4. Exercise certificate issuance and submission with concurrent requests, retries, Redis outages, MongoDB outages, and partial-write failures.
5. Prove certificate submission idempotency across all relevant failure/retry paths.
6. Verify Redis lock expiry, recovery, and concurrency behavior under real service timing.
7. Verify Redis/MongoDB consistency and recovery after one service succeeds while the other fails.
8. Confirm cached certificate submission results are scoped to user, attempt, exam version, and submission identity.
9. Validate rate-limit behavior during Redis outages and on malformed identity signals.
10. Verify certificate signing key generation, storage, rotation, and recovery in the deployed environment.
11. Verify revocation behavior when MongoDB or revocation data is unavailable.
12. Run negative input-validation tests against all certificate actions and public endpoints.
13. Run authentication and cross-user authorization tests against certificate operations.
14. Verify MongoDB indexes and uniqueness constraints in every deployment environment.
15. Review public error responses and logs for internal details or sensitive data leakage.
16. Verify operational logs and alerts for certificate, integrity, and provider failures.
17. Verify the Tutor model identifier and revision with the actual configured provider in staging.
18. Test malformed, empty, oversized, delayed, and failed AI provider responses.
19. Run prompt-injection and untrusted-context tests for the Tutor.
20. Validate Tutor rate limits under concurrent requests and multiple identities.
21. Confirm request body limits are enforced before expensive provider work.
22. Confirm AI provider secrets never appear in client bundles, logs, or public error responses.
23. Validate Tutor response safety and educational quality with representative test cases.
24. Verify provider usage ceilings and cost alerts in production.
25. Verify missing or invalid Tutor configuration fails safely in staging and production.
26. Test malformed, unsatisfiable, suffix, multiple, and boundary Range headers against the live Cloudflare Worker and Netlify endpoint.
27. Test truncated upstream responses and incorrect Content-Range/Content-Length metadata against live endpoints.
28. Test redirect chains against the deployed upstream host allowlist.
29. Verify cache isolation between artifact versions, ranges, query parameters, and deployment environments.
30. Test interrupted, retried, and concurrent ISO downloads with real artifacts.
31. Verify end-to-end digest enforcement across every configured ISO origin and delivery route.
32. Confirm large-download memory, browser storage quota, retry, and boot-timeout behavior on supported devices.
33. Verify all catalog entries are clearly distinguished as complete, planned, draft, or unavailable.
34. Confirm every advertised lesson route resolves to real content or an explicit unavailable state.
35. Run automated broken-link checks across lesson/catalog/navigation routes.
36. Verify invalid lesson IDs produce a clear not-found state.
37. Verify progress tracking never treats placeholder lessons as completed.
38. Validate catalog IDs, titles, categories, and status metadata for duplicates and inconsistencies.
39. Generate catalog coverage counts from source data and compare them to published claims.
40. Complete keyboard, focus, label, and assistive-technology checks for lesson flows.
41. Establish editorial accuracy and completeness review for learning content.
42. Run the complete current CI workflow and retain the results for this commit.
43. Add or expand runtime regression tests for any issues confirmed during the full CI run.
44. Run the production build from a clean checkout with all expected assets.
45. Run browser smoke tests and boot the actual supported guest images.
46. Validate all artifact sizes and digests against the actual release assets, not only manifest syntax.
47. Verify Git LFS assets are hydrated and correct in CI and release environments.
48. Review current dependency and secret-scan findings and document any exceptions.
49. Confirm required security tests block release when failing.
50. Verify the production deployment is built from the reviewed commit.
51. Validate deployed environment variables, routing, headers, redirects, and function bindings.
52. Improve CI failure diagnostics where actual logs show missing actionable context.
53. Keep threat-model language aligned with the deployed isolation architecture.
54. Validate production CORS policies for all sensitive endpoints.
55. Review deployed CSP and other security headers against actual application requirements.
56. Audit production secrets, least-privilege scopes, and insecure fallback configuration.
57. Verify administrative/internal operations enforce authorization in the deployed system.
58. Load-test abuse controls for expensive operations and distributed clients.
59. Review current dependency advisories and upgrade/mitigate confirmed risks.
60. Test that security-sensitive errors never trigger unverified-artifact or authorization bypass fallbacks.
61. Confirm production alerts exist and fire for integrity failures, abnormal error rates, abuse, and certificate verification failures.
62. Write and test recovery runbooks for signing-key compromise, artifact corruption, provider outages, and bad deployments.
63. Update the audit evidence with the final CI run, exact commit, and test limitations.
64. Document trusted artifact hash provenance and the release update procedure.
65. Document the certificate lifecycle and key/revocation recovery process.
66. Document required deployment environment variables, indexes, secrets, and services.
67. Keep planned catalog entries clearly distinct from implemented features in UI and metadata.
68. Add and test operational runbooks for download, certificate, and deployment failures.
69. Consolidate duplicate integrity/protocol logic where safe, with cross-platform regression tests.
70. Convert any remaining security assumptions discovered during the full audit into enforceable automated checks.
