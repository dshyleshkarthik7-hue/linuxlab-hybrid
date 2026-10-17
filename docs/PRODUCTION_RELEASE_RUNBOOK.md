# Production release runbook

This runbook separates automated repository checks from checks that require live credentials or GitHub/Netlify account permissions. A green source CI run is necessary but does not prove production configuration is healthy.

## 1. Preflight staging first

Use the Netlify CLI authenticated to the correct site and run the preflight in the **staging/preview context first**:

```sh
netlify env:run --context deploy-preview -- npm run release:preflight
```

The script checks that:
- the active certificate signing key ID resolves to a configured signing key without printing secret values;
- the production origin is present in the certificate CORS allowlist;
- Upstash Redis responds to a ping;
- MongoDB is reachable and the certificate TTL and durable revocation indexes exist (the preflight creates those indexes if missing);
- the Hugging Face Router accepts the exact pinned Qwen model revision and returns a completion.

The preflight sends a tiny test prompt to the model provider and creates the two expected MongoDB indexes if needed. Use a staging database and staging credentials first. Do not point it at production until the staging run succeeds and the change is approved.

After staging passes, run against production only in an approved maintenance/release window:

```sh
netlify env:run --context production -- npm run release:preflight
```

Do not paste or commit environment-variable values into issues, logs, or this repository.

## 2. Certificate lifecycle smoke test

Using the deployed staging site and test account:
1. Start an assessment and submit a valid completed attempt.
2. Verify the resulting certificate using the public verification page and confirm the signature and expiry.
3. Revoke a disposable staging certificate using the documented revocation path and verify that the public endpoint returns the revoked status.
4. Confirm an expired staging certificate is rejected after its expiry.
5. Confirm the certificate signing key ID used for signing is present in the verifier's key set during key rotation.

Do not use real learner data or revoke a production certificate as a test.

## 3. VM, ISO and browser security smoke tests

Run the Playwright browser/real-guest gates in CI. After deployment, run:

```sh
PRODUCTION_BASE_URL=https://linuxterminal.me npm run test:production
```

The smoke test checks the published build identity, key routes, security headers and chunked ISO delivery. Verify a real guest boot in a supported browser as a separate release gate; a successful static build is not proof that the guest kernel reaches its readiness marker.

## 4. Verify the actual deployment

After CI passes, verify in Netlify that the published deployment commit equals the intended `main` commit and that the deploy state is `ready`. Run the production smoke test against that deployment. Keep the previous successful deployment available for rollback until smoke checks pass.

## 5. GitHub independent-review controls

The current repository CODEOWNERS entry names only the repository maintainer. A second **real, trusted** maintainer must be added by the repository owner; do not use a placeholder or an invented account. In GitHub repository **Settings → Rules → Rulesets** (or branch protection settings), require a pull request, at least one approval from someone other than the author, CODEOWNERS review on security-sensitive paths, resolved review threads, and the required CI check. Confirm the ruleset is active rather than merely documented.

The repository integration available to this audit cannot change or conclusively verify the repository's branch-protection settings or add a collaborator. Until an owner completes this step, the release must not be described as independently reviewed.