# Release governance

## Required production release path

Production changes should reach `main` through a pull request with an independent reviewer. GitHub branch protection or a repository ruleset must require:

- pull requests before merging to `main`;
- at least one approving review from a user other than the author;
- CODEOWNERS review for `/src/`, `/netlify/`, `/iso-builder/`, and `/tests/`;
- required CI status checks before merge;
- administrators included in the protection rules where appropriate.

The repository contains CODEOWNERS, but the current file names only the maintainer account; it does not provide independent review. Add a second trusted maintainer before relying on CODEOWNERS for production review. Repository files cannot enable GitHub-side enforcement settings, and API verification may be permission-restricted. Verify required approvals, last-push approval, resolved review threads, and the required CI check in **Settings → Rules → Rulesets** (or branch protection settings) before a production release. If those settings or a second reviewer are absent, do not describe the release as independently reviewed.

## Deployment gate

Netlify production deployment should be performed only after the merged commit has passed CI. After deployment, run the post-deployment production smoke test against `https://linuxterminal.me` and record the deployment commit and smoke-test result.

## Bus-factor note

Until a second maintainer is assigned as a CODEOWNER and can independently approve production changes, the project remains a single-maintainer project. CI and documentation reduce operational risk but do not substitute for independent review.
