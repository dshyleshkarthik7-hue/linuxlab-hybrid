# Free-tier AI model strategy and measurable pilot

## Zero-cost default

The curriculum factory routes through **Gemini free tier → OpenRouter free-model router**. It uses only:
- `gemini-3.1-flash-lite` (allowlisted free-tier model; the Google project must have billing disabled);
- `openrouter/free` or an explicitly `:free` model ID.

A provider quota failure advances to the next configured free provider. If all free routes are exhausted, the batch fails and is resumable; it does not switch to a paid model. Free quotas, model routing and availability can change. Google free-tier data may be used to improve Google's products, so do not send secrets, private learner data, or unpublished sensitive content.

Hugging Face routed inference is intentionally excluded from the default route because free-account credits are small and routing can be billable. It can only be enabled by explicitly setting both `AI_ALLOW_HF_ROUTER=1` and `HF_ROUTER_BILLING_DISABLED=1` after verifying billing is disabled in that account. The factory does not make paid requests intentionally.

## Configure GitHub Actions

Add repository Actions secrets:
- `GEMINI_API_KEY`: Google AI Studio key for a project with billing disabled.
- `OPENROUTER_API_KEY`: OpenRouter key; use only `openrouter/free` or `:free` model IDs.

The workflow supports `provider=auto`, `provider=gemini`, and `provider=openrouter`. Use `auto` for normal fallback. To compare providers, run the pilot once per provider so each output is saved in a separate artifact folder. Missing keys or exhausted quotas should fail visibly, never silently switch to paid inference.

## Pilot protocol

### Stage A — small paired comparison
Run the `Curriculum Factory` workflow with `target=pilot` once with `provider=gemini` and once with `provider=openrouter`. Each run drafts the same five representative command lessons and two tutorials into an isolated `artifacts/ai-pilot/<provider>/` directory. This is a low-cost screening sample, not a quality claim.

### Stage B — validation set on the winner
After choosing a provider from Stage A, run the ordinary authoring queues on a **20-command validation set and five complete tutorials**. Include easy, common commands; complex text/process tools; GNU-vs-BusyBox differences; and potentially destructive commands that must be documented with safe examples only. Do not run dangerous examples.

### Score every artifact

Two reviewers should independently score each item from 0–2 in each category (0=fail, 1=partial, 2=strong):
1. Factual correctness against an authoritative man page or upstream manual.
2. Topic-specific depth and clarity; no filler/template reuse.
3. Syntax/options and portability boundaries accurately qualified.
4. Examples are safe, reproducible, and expected behavior is not fabricated.
5. Quiz/exercise answer correctness and useful rationale.
6. Source URLs actually support the claims (not merely plausible URLs).

Maximum: 12 per item. Record scores, reviewer disagreements, provider/model, errors and latency in a CSV or spreadsheet. The winning model must achieve:
- mean score **at least 10/12**;
- **zero critical factual or safety errors**;
- at least **90%** of examples passing in a disposable Linux test harness where executable;
- **zero** duplicate/template-failure items in the validation set;
- all citations checked for sampled factual claims.

If either model misses the gate, improve prompts/schema and repeat the pilot. Never relax the correctness gate to fill the catalogue faster.

## Scale-up

1. Run bounded, resumable batches (25 commands or 10 tutorials/curriculum items maximum per workflow run).
2. Preserve each generated file as a draft; do not commit model output automatically to learner-facing pages.
3. Run `npm run audit:curriculum-quality` and the safe-command execution harness; manually review high-risk, ambiguous, and platform-specific commands.
4. Publish only after source verification, example test evidence, duplicate checks, human approval, and build/route tests.
5. Track factual quality and verification coverage separately from raw inventory counts.

A free API quota may be too small or inconsistent to generate all 6,161 command lessons and 520+ tutorials quickly. The system pauses/fails on quota exhaustion; resume later rather than enabling billing.
