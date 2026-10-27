# Content quality and editorial review

## Current truthful baseline

The command catalog is inventory, not completed lesson coverage. The current README reports 6,161 catalog entries: 26 complete, 174 planned, and 5,961 without lesson status/content. These counts must be regenerated from the source catalog when its data changes; they do not establish editorial accuracy.

## Required review record

For each lesson promoted to `complete`, retain:

- a named human reviewer and review date;
- the Linux distribution/version or POSIX scope for command behavior;
- verified syntax, flags, examples, and expected output;
- a safety review for destructive commands, privilege escalation, network access, and commands that alter system state;
- a beginner-appropriate explanation and a topic-specific knowledge check;
- execution evidence when examples are marked as tested;
- working canonical route, related links, and an explicit correction history.

A generated or structurally complete lesson is not automatically fact-checked. Do not populate reviewer metadata without a real review.

## Release checklist

1. Run `npm run audit:curriculum` and `npm run test:coverage`.
2. Run generated command-page validation and internal-link checks.
3. Sample-check factual claims against authoritative Linux/POSIX documentation and test commands in a disposable environment.
4. Prioritize commands with destructive or privileged behavior, then the 200-command beginner curriculum, then remaining entries.
5. Keep planned, draft, unavailable, and reviewed states distinct in UI and metadata.
6. Record remaining review debt explicitly; do not describe the entire catalog as 6,161 complete lessons.
