# Production release contract

## Required automated gates

Every production commit must pass the repository's complete CI contract, including TypeScript/build, unit and adversarial tests, security-static tests, VM policy/integrity tests, certificate contract tests, release-security tests, site-route checks, coverage, dependency audit, and the production build.

## Route and asset contract

The production build must contain every public HTML entry point and every stylesheet/module referenced by those pages. `/learn`, `/tutorials`, `/challenges`, `/quiz`, `/progress`, `/certificate`, and `/verify` must resolve to an application document rather than a hosting 404. Canonical trailing-slash redirects must not create loops.

## Learning record privacy

The learning ledger is browser-local. It may contain a learner display name, session timestamps, tutorial/challenge completion, points, quiz attempts/best score, and local certificate metadata. It must not persist terminal input/output, guest filesystem contents, VM memory, passwords, tokens, or arbitrary command history.

## Certificate semantics

The local completion certificate is a learning record and must never be represented as a server-verified credential. The verified certificate is issued only by the authenticated server-side assessment after server grading and passing the configured threshold.

## Deployment acceptance

After deployment, manually verify every primary route, stylesheet, JavaScript module, v86 firmware endpoint, tutorial navigation, challenge completion, quiz persistence, progress history, local completion certificate, authenticated verified assessment, certificate verification, Tutor authentication/rate limiting, and the offline guest session. Record the deployed commit SHA and retain the previous known-good SHA for rollback.

## Failure policy

Missing production secrets, unavailable distributed rate limiting, failed artifact integrity checks, failed certificate signing configuration, failed build, failed browser route checks, or failed security tests are release blockers. Do not silently downgrade a security control to an unbounded or process-local implementation in production.
