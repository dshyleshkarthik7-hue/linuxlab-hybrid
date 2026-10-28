# Main-branch audit — 28 October 2026

## Executive summary

This audit inspected the current `main` source for the curriculum factory, AI provider fallback, draft-quality gates, relevant CI workflows, security/release contracts, and the latest GitHub Actions logs. It found several concrete automation defects and applied fixes directly to `main`. The audit is source-level plus GitHub Actions evidence; it is **not** proof that production services, secrets, the live AI providers, or every browser/device path have been tested.

## Confirmed defects fixed

1. **CI contract drift:** `tests/shared-nav-contract.test.mjs` expected an obsolete border-color setter signature although the build injector correctly passes the element as the first argument. Updated the assertion to test the current contract.
2. **Partial-batch quality gate:** the quality audit treated every not-yet-authored inventory entry as an unconditional failure, which made bounded generation batches fail even when their generated files were valid. Missing inventory entries are now informational for ordinary bounded audits; full-inventory strict mode and strict pilot mode still fail on missing drafts.
3. **Insufficient draft validation:** the quality gate now checks required command/tutorial/curriculum fields, example shape, minimum curriculum steps, quiz structure and answer-index bounds, source titles, HTTPS URL shape, unsafe command patterns, known factual contradictions, and near-duplicate candidates. It also fixes file-to-vector index alignment when invalid JSON files are present. These checks are deterministic structure and risk checks, not proof of truth or source validity.
4. **Legacy authoring workflow could not use the configured providers:** `.github/workflows/qwen-authoring.yml` supplied only `HF_TOKEN` even though Hugging Face routing is disabled by default in zero-cost mode. It also exposed full-inventory `all-*` actions. It now uses the same free-tier Gemini/OpenRouter fallback strategy as the curriculum factory and enforces bounded batches only.
5. **Provider fallback could stop too early:** a disabled optional Hugging Face provider could abort a configured provider chain instead of falling through. Provider setup errors are now recorded and later providers are tried. OpenRouter responses whose returned model ID is not explicitly marked free are rejected and trigger the next candidate.
6. **Pilot content risks:** the tutorial prompt now instructs generation to avoid reusing existing draft objectives/examples/exercises and keeps `/etc/os-release` examples consistent. The command prompt explicitly avoids an unverified `tree` exit-status claim. The quality gate includes regression checks for these known issues.
7. **Regression coverage:** tests were added for factual red flags, schema/source/quiz validation, malformed source URLs, bounded authoring workflow settings, disabled-provider fallback, and non-free OpenRouter response rejection.

## Important content-quality controls

- Generated content remains in review-draft queues; it is not automatically published.
- Model output, candidate source URLs, and plausible-looking examples are not accepted as evidence that claims are correct.
- `--strict-quality` blocks pilot warnings and missing expected pilot drafts. `--release` remains a separate gate requiring human review, source verification, and execution verification.
- The authoring workflows are bounded. No full-inventory generation was started during this audit.

## Remaining risks and external verification required

1. **CI is the authoritative execution check.** The latest commit must complete the full `CI` workflow successfully before treating the code changes as verified. Review the latest run at https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/actions.
2. **Production and credentials:** repository source inspection cannot validate private Netlify/Cloudflare secrets, account billing configuration, deployed environment variables, production headers, rate limits, or live endpoint behavior. Run the documented staging preflight and approved production smoke workflow.
3. **Developer Alpine artifact integrity:** existing audit documentation marks the chunk manifest as template/not deployable until hashes are generated from the real, size- and SHA-256-verified release artifact. Do not invent hashes or enable the route while that release gate is unmet.
4. **Real guest and cross-browser behavior:** source contracts are not a substitute for the CI browser matrix, real ISO boot, constrained-device testing, or production smoke.
5. **Human review:** a generated lesson can pass structural checks and still contain wrong facts, unsuitable pedagogy, a dead citation, or an example that fails on a target distribution. Review and independently test drafts before release.
6. **Repository governance:** an active repository ruleset was visible during this audit. It requires one approving review, approval of the latest push, resolved review threads, and the `verify` status check. It does **not** require CODEOWNERS review and has no configured required reviewers. The branch-protection endpoint itself denied this audit connection, so any separate branch-protection settings could not be confirmed. Add a second trusted maintainer and consider enabling CODEOWNERS review before a production release.
7. **Catalog coverage:** the canonical 6,161 command count is catalog inventory, not 6,161 complete lessons. The README currently reports 26 complete entries, 174 planned entries, and 5,961 without lesson status/content. Do not describe the catalog as fully authored.

## Verification status

- Source changes are committed on `main`.
- Regression tests have been added, but they are only considered passed when the latest commit's CI run completes successfully.
- The previous curriculum pilot passed generation and artifact upload, but that did not verify the truth of every generated claim. Corrected pilot drafts remain review material, not release-ready lessons.
- No production deployment, full-inventory generation, live-provider billing test, or real-guest boot was performed as part of this audit.

## Change references

- Shared navigation contract correction: `8beec44`
- Draft schema/source validation and similarity index alignment: `aa5e267`
- Strict pilot quality gate and bounded queue behavior: `0b31405`
- Legacy authoring workflow replaced with bounded free-tier flow: `550de94`
- Free-tier fallback hardening: `ec2eb40`, `3978534`
- New schema/source and provider regression tests: see the latest `main` commits and CI run.



## Follow-up remediation — 28 October 2026

### Implemented after the initial audit

- Added a client-side **Linux Error Decoder** at `/tools/linux-error-decoder/`. It covers common shell, path, permissions, storage, networking, SSH, package-manager and pipeline errors; it runs without an AI key or server-side text submission, includes safe diagnostic steps, visible FAQ content, canonical metadata and WebApplication/FAQ structured data. It is linked from the homepage and tutorial index and included in the generated and committed sitemap.
- Corrected homepage copy that could imply 200+ completed command lessons and the inaccurate “1 GiB” Developer Alpine size. The copy now distinguishes the 200-command beginner path from the 6,161-entry reference and uses the ~659 MiB image size.
- Added a `--next-missing --count N` option to command authoring. It selects bounded command batches without an existing research draft or curated complete page.
- Updated the legacy authoring workflow to default to the next missing command batch and create a draft-only pull request for generated research files. The PR is not auto-merged and explicitly requires source, safety, portability, execution and human review. This makes accepted batches persist and lets later batches advance after review/merge; it does not turn drafts into published lessons.
- Fixed additional CI contract drift: the full test suite now includes the Phase 3 readiness contract, and the assertion matches the actual push-triggered CI requirement in the Cloudflare deployment gate.
- The latest observed CI run verified the Developer Alpine release bytes and generated SHA-256 chunk digests successfully before later failing in the release-readiness test contract. A subsequent test correction was committed; the newest CI run must finish to verify the corrected full suite.

### Catalog status — still incomplete

The canonical count remains an inventory count, not an authored-content count. The last checked repository summary reported 26 complete command lessons, 174 planned entries, and 5,961 entries without lesson status/content. The 6,161-entry command inventory and 520-item tutorial/curriculum queues have **not** been bulk-authored or approved in this audit. The new resumable workflow is the safe mechanism to create bounded review PRs; each batch still needs review and merge. No synthetic lesson content or fabricated verification evidence was added to make the counts appear complete.

### Production and external controls — not marked fixed

- The latest inspected scheduled production smoke run (`40646708187`) failed because the live `build-info.json` did not report the expected repository commit (the observed value was `undefined`). This is a real production-provenance failure, not a test to weaken.
- The connected Netlify project metadata reported a ready deploy with context `deploy-preview`, branch `fix/cloudflare-validate-raced-response`, commit `6f5b41ccab832be32e33eba1a131aec384bbc548`, and `locked: true`. That is not evidence that current `main` is serving in production. The available integration does not expose an authorized publish/unlock action, so I did not override the lock or publish an unverified build. A project owner must unlock/restore the intended main-branch production deployment after CI passes, then rerun the explicit production smoke gate.
- Developer Alpine chunk hashes must continue to be generated from the actual pinned release bytes by the CI/deploy workflow. The committed empty-hash file is a non-deployable template; do not fill it with guessed hashes. The deployment workflow regenerates and validates the real chunk manifest before deploying the Worker.
- The repository ruleset still requires independent approval, but the observed settings do not enforce CODEOWNERS review and no second trusted maintainer identity was supplied. I did not invent a reviewer or weaken branch protection. A repository owner must add a second trusted maintainer and enable the desired CODEOWNERS review requirement in GitHub settings.

### Current release decision

**Do not declare production fully verified yet.** The code-side remediation is on `main`; the final CI run for the latest commit and a successful production deployment/provenance smoke are still required. Draft generation remains review-only, and no full-catalog generation or publication was triggered.
