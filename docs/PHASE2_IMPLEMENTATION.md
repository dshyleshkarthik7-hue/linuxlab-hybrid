# Phase 2 — learning product implementation

## Delivered in this commit
- **Lincyb AI tutor UI:** responsive page uses the existing same-origin `/api/tutor` endpoint, bounds learner input, renders answers as plain text, and warns learners not to submit secrets.
- **Optional voice:** browser speech recognition fills the editable question field and requires review/submission; speech synthesis reads an answer only after an explicit click. Typed input remains available where voice is unsupported. Recognition/speech stop on page exit.
- **Curated scenario quiz:** adds 30 practical questions spanning paths, pipes/redirection, exit status, filesystem search, permissions, storage, processes, services, networking, SSH trust, packages, scheduling, shell quoting, backups, and least privilege. Rationales appear after each answer.
- **Guided challenges:** adds 15 browser-graded scenario tasks with hints, explanations, retry after wrong answers, local completion tracking, and no shell execution.
- **Regression gate:** tests tutor safe rendering, voice fallback contracts, privacy copy, scenario bank, guided-task data, deterministic grading, and CI wiring.

## Existing foundations
The repo already has a 520-entry structured curriculum inventory, 6,161-entry command catalogue, tutorial routes, 30 challenge sets, a generated 500-question practice quiz, server-graded certificates, and a rate-limited tutor API. Inventory counts alone do not prove every entry is fully authored or reviewed.

## Required follow-up before declaring Phase 2 complete
1. Human-review all 520 curriculum activities; remove repeated/template-only bodies and require a meaningful worked example, topic-specific task, and evidence before publishing.
2. Replace catalog-name trivia with tested scenario questions until the assessment is predominantly curated.
3. Add actual task/expected-result checks to challenges rather than relying on completion buttons alone.
4. Test accessibility and voice behavior across supported browsers, including permission denial and service failure.
5. Verify the tutor in production with real authentication, provider credentials, rate limiting, outages, and cost/latency monitoring.
6. Run `npm run test:phase2-learning`, `npm run test:quiz-quality`, `npm run test:tutorials`, certificate tests, full CI, and production smoke.

This is a substantial Phase 2 implementation slice, not a claim that all 520 lessons have been individually authored/reviewed or that production integration has been verified.