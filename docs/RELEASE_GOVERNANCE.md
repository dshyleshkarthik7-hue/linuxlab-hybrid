# Release Governance

LinuxTerminal treats `main` as the production source of truth.

## Required controls

- `main` must be protected in GitHub with pull requests, required CI, and at least one approving review before production releases.
- Direct pushes to `main` should be disabled after this atomic remediation commit.
- Production deployment must use the commit that passed the complete CI workflow, including historical secret scanning, TypeScript linting, browser smoke, real-guest checks, mobile checks, and production smoke.
- Secrets are configured only in the deployment environment; none belong in Git history.
- Releases must have a rollback target recorded as the previous known-good commit.
- A production incident involving credentials requires immediate credential rotation even if a later commit removes the credential from the working tree.

The repository integration used for this remediation can write repository content but cannot administer GitHub branch-protection/ruleset settings. Therefore branch protection is an external repository control and must be verified in GitHub before treating governance as complete.

## Single-maintainer operation

The project may remain single-maintainer, but production changes must still pass the automated gates. If a second maintainer is added, update `CODEOWNERS` and require review from that owner for `/src/`, `/netlify/`, `/iso-builder/`, and `/tests/`.

## Deployment resilience

Netlify remains a deployment dependency. The application must not claim provider-level redundancy that is not configured. Keep a tested rollback commit, preserve the production URL smoke test, and document provider outage procedures in `docs/DEPLOYMENT.md`.
