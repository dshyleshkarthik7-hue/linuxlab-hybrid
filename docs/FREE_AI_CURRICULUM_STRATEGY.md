# LinuxTerminal three-stage AI orchestration (zero-paid-API policy)

## Pipeline

Every command, tutorial, and structured-curriculum draft passes through three separate model calls. Each role has independent provider/model settings, and the resolved model is recorded in the draft's `model.stages` metadata.

1. **Generator — Arcee Trinity Large Preview (`arcee-ai/trinity-large-preview:free`) via OpenRouter.** Creates the complete first draft. This is the strongest configured free-tier candidate in this pipeline, not a claim that it is the strongest AI model overall.
2. **Verifier/repairer — Arcee Trinity Mini (`arcee-ai/trinity-mini:free`) via OpenRouter.** Reviews the first draft for major factual mistakes, missing fields, unsafe commands, portability issues, unsupported claims, and broken exercises, then returns a corrected complete JSON object.
3. **Final editor — Gemini 3.1 Flash-Lite via Google's free tier.** Reviews both earlier versions, fixes remaining contradictions, completeness, clarity, and schema issues, and returns the final object. It cannot certify source URLs or command execution.

All three stages must succeed and the final schema validator must pass. A failed stage, invalid JSON, or exhausted free quota stops that item; the factory never skips a quality stage or intentionally falls back to a paid model. The actual provider/model used at every stage is saved for auditability.

## Free access and limits

- [OpenRouter free models](https://openrouter.ai/pricing/) are zero-priced, but free access is rate-limited and availability changes. The [Trinity Large Preview](https://openrouter.ai/arcee-ai/trinity-large-preview:free) and [Trinity Mini](https://openrouter.ai/arcee-ai/trinity-mini:free) model pages list zero token pricing when available.
- Google's [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) currently lists Gemini 3.1 Flash-Lite as free-tier eligible. Use a Google AI Studio project with billing disabled. Google says free-tier content may be used to improve its products; do not send secrets or private learner data.
- A model being open-weight does not make hosted inference free. This pipeline permits only explicitly `:free` OpenRouter IDs or `openrouter/free`, and Gemini models on a small allowlist.
- Free quota is not unlimited. Three calls per lesson mean the free request allowance only covers a fraction of the catalogue per day. Pause and resume rather than enabling billing.
- GitHub Actions minutes and provider quota are separate. Use the repository's included Actions allowance and monitor usage; this workflow does not buy credits or change billing.

## Configure GitHub Actions

Add repository Actions secrets `OPENROUTER_API_KEY` and `GEMINI_API_KEY`. Never commit keys. The manual **Curriculum Factory** workflow accepts `provider=auto`, `provider=openrouter`, or `provider=gemini`. `auto` uses the tiered defaults above with free-only fallback.

Role settings can be overridden:
- `AI_GENERATOR_PROVIDER_ORDER`, `AI_VERIFIER_PROVIDER_ORDER`, `AI_FINAL_PROVIDER_ORDER`
- `AI_GENERATOR_OPENROUTER_MODEL`, `AI_VERIFIER_OPENROUTER_MODEL`, `AI_FINAL_OPENROUTER_MODEL`
- `AI_GENERATOR_GEMINI_MODEL`, `AI_VERIFIER_GEMINI_MODEL`, `AI_FINAL_GEMINI_MODEL`

OpenRouter model overrides must be `openrouter/free` or end in `:free`; Gemini overrides must be on the code allowlist. Do not add paid model IDs to a fallback list.

## Pilot before bulk generation

1. In Actions, run **Curriculum Factory** with `target=pilot`, `provider=auto`. It generates five command drafts and two tutorial drafts in an isolated artifact folder, with the model for each stage stored in every draft.
2. If quotas allow, compare the same sample with `provider=openrouter` and `provider=gemini`. Compare reviewed output and stage provenance, not model self-assessments.
3. Validate 20 command lessons and five tutorials. Include common commands, text/process tools, GNU-vs-BusyBox behavior, shell edge cases, and potentially destructive commands (safe examples only).
4. Have two reviewers independently score each item 0–2 across factual correctness, specificity, syntax/portability, safe examples, correct exercises, and verified sources. Maximum 12.
5. Proceed only if mean score is at least 10/12, critical factual/safety errors are zero, at least 90% of executable examples pass in a disposable Linux harness, no duplicate/template failures remain, and sampled source claims are checked.

If the pilot fails, revise prompts/schema and repeat. Do not lower the gate to increase output volume.

## Bulk generation and publication gates

- Keep batches bounded and resumable (25 command records or 10 tutorial/curriculum records per run).
- Keep AI output in review-draft directories or artifacts; never auto-publish.
- Run `npm run audit:curriculum-quality`, safe example execution, source checks, duplicate checks, and human review.
- Only mark content complete after independent verification and review. Inventory counts (6,161 command records and 520 structured-curriculum records) are not counts of verified lessons.
- Store the three model IDs, provider, usage where supplied, and strategy version with each draft. The model may not mark its own output human-reviewed or executed.
