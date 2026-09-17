# Release governance

## Required production release path

Production changes should reach `main` through a pull request with an independent reviewer. GitHub branch protection or a repository ruleset must require:

- pull requests before merging to `main`;
- at least one approving review from a user other than the author;
- CODEOWNERS review for `/src/`, `/netlify/`, `/iso-builder/`, and `/tests/`;
- required CI status checks before merge;
- administrators included in the protection rules where appropriate.

The repository contains CODEOWNERS, but repository files cannot enable these GitHub-side enforcement settings. They must be verified in **Settings → Rules → Rulesets** (or branch protection settings) before a production release is treated as independently reviewed.

## Deployment gate

Netlify production deployment should be performed only after the merged commit has passed CI. After deployment, run the post-deployment production smoke test against `https://linuxterminal.me` and record the deployment commit and smoke-test result.

## Bus-factor note

Until a second maintainer is assigned as a CODEOWNER and can independently approve production changes, the project remains a single-maintainer project. CI and documentation reduce operational risk but do not substitute for independent review.
