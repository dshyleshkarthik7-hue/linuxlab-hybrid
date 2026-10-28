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
6. **Repository governance:** branch protection/ruleset enforcement and the presence of an independent second maintainer are GitHub-side settings; source files cannot prove they are enabled. Verify them in repository Settings.
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

