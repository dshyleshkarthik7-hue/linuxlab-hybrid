# Contributing

This repository is source-available but proprietary. Opening an issue or proposing a change does not grant permission to copy, redistribute, modify, publish, or commercially use the Software. Changes may be accepted by the copyright owner at their discretion and remain subject to `LICENSE`.

## Development setup

```bash
npm ci
npm run dev
```

## Quality gate

Before proposing a change, run:

```bash
npm run test
npm run build
```

For browser VM changes, also run the CI smoke workflow or its equivalent environment.

## Code standards

- Keep TypeScript strict; do not add `as any`.
- Do not swallow errors silently.
- Prefer small typed helpers over compressed one-line logic.
- Add a regression test for every shell or interpreter bug fixed.
- Keep Engine A behavior explicitly educational; do not imply simulated output is real system output.
- Treat Engine B as temporary and untrusted.

## Security

Do not add host-shell execution, arbitrary local file access, secrets, or credentials to Engine A. Validate persisted user-controlled identifiers before storage.
