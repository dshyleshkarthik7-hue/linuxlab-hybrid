# Production operations and security gates

## Non-source controls

These controls cannot be completed by a source commit and must be configured in the GitHub/Netlify/Cloudflare/MongoDB/Upstash accounts:

1. Require pull requests and at least one approving reviewer on `main`; require CODEOWNERS review and the `verify` status check.
2. Use two independent production maintainers; no person should approve their own production change.
3. Use separate staging and production projects/accounts and least-privilege deployment tokens.
4. Configure MongoDB automated backups, point-in-time recovery where available, and perform a restore drill at least quarterly. Record RPO/RTO.
5. Maintain two active certificate signing keys during rotation; test recovery quarterly; retain old verification keys until all certificates they signed have expired or been explicitly revoked.
6. Configure Cloudflare worker deployment to the intended account and verify the worker deployment identity after every release.
7. Enable GitHub secret scanning/push protection and review historical secret-scan results.
8. Run an independent security assessment before treating the browser VM as a production hostile-code execution environment. Browser v86 is not a host-kernel isolation boundary.

## Release gates

A release is production-eligible only when CI passes, the production smoke test serves the exact commit SHA, artifact attestations verify, the SBOM is generated, and the staging smoke test has passed using production-equivalent headers and ISO infrastructure.

## Recovery drills

Record successful database restore, signing-key recovery/rotation, Cloudflare rollback, Netlify rollback, and dependency-outage drills. A document alone does not count as a completed drill.
