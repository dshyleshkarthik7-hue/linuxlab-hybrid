# Phase 1 — repository and release baseline

**Purpose:** establish a repeatable, CI-enforced baseline before expanding the curriculum or changing execution architecture.

## What this change implements

- Adds `npm run phase1:check`, a deterministic repository contract audit and regression test.
- Runs the readiness gate in the existing GitHub Actions CI pipeline before the normal lint/test/build gates.
- Verifies package/lockfile consistency, required verification scripts, command catalog identity and explicit status metadata, curriculum IDs and track totals, release artifact sizes/digests, tutor request bounds, security-boundary wording, and CI least-privilege permissions.
- Reports page and intelligence statuses separately. Catalog inventory counts are not interpreted as complete, reviewed lessons or executable examples.
- Records the remaining engineering work and evidence required before calling Phase 1 complete.

## Baseline facts and risks

| Area | Current control / observation | Required follow-up |
|---|---|---|
| Browser VM | Documentation explicitly says browser v86 is not a host-kernel security boundary. | Keep arbitrary hostile workloads out of shared server infrastructure; independently review lifecycle/resource controls and guest message handling. |
| Resource exhaustion | Browser lifecycle and resource policies are defense-in-depth. | Exercise cancellation, memory pressure, concurrent boots, output floods, and page teardown in real browsers; document limits as advisory. |
| Command catalog | Canonical catalog is checked for unique IDs/names, local URLs, and explicit page/intelligence status. | Review content correctness and execution evidence separately; do not equate a stub with a lesson. |
| Content pipeline | Existing database, page-generation, curriculum, and generated-content tests remain the source of detailed checks. | Require generated diffs to be reproducible; keep AI-authored drafts distinct from reviewed/published content. |
| Tutor and secrets | Tutor code bounds request sizes; production credentials must remain in provider-side environment configuration. | Verify configured production secrets, origin/rate-limit behavior, failure modes, and logs in deployment without exposing secret values. |
| ISO delivery | Artifact manifest is checked for positive sizes and SHA-256 shape. Existing ISO tests cover stronger integrity contracts. | Run full real-guest and range/fallback tests against release artifacts and both delivery paths. |
| Dependencies and CI | Lockfile and CI permissions are checked; existing CI includes dependency audit and other quality gates. | Triage actual audit findings; confirm branch protection and required checks in GitHub settings. |
| License | Repository declares a proprietary license and separately identifies third-party notices. | Confirm rights and attribution for every redistributed asset and generated content; this gate does not provide legal advice. |
| Architecture | Architecture/security docs define the two execution environments and trust boundaries. | Refactor the large engine only in behavior-preserving slices with regression tests; this change intentionally does not rewrite runtime architecture. |
| Operations | Existing preflight, smoke, provenance, and deployment workflows remain in place. | Verify production rollback, provider outage, key rotation, backups, and alert ownership with operators. |

## How to run

```sh
npm ci
npm run phase1:check
npm run lint
npm run test:ci
npm run build
```

The new readiness check needs only Node.js and repository files; it does not call external services or print environment-variable values.

## Exit criteria

Phase 1 is not complete merely because this structural gate passes. Before declaring it complete, a maintainer must also:

1. Run the full commands above on Node.js 22+ with the required Git LFS assets and dependencies.
2. Review the resulting CI logs and remediate all failing or high-severity findings.
3. Run browser/real-guest and ISO fallback tests against the release candidate, including memory-pressure and teardown cases.
4. Confirm branch protection, required status checks, secret configuration, deployment rollback, and monitoring in GitHub/hosting settings.
5. Record unresolved findings with severity, owner, evidence, and a tracked remediation issue.

**Limit:** the gate is a structural contract check, not a penetration test, proof of host isolation, curriculum quality certification, legal review, or production health attestation.
