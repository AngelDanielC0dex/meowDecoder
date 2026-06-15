# Contributing

## Workflow

1. Branch from `main`: `feat/…`, `fix/…`, `docs/…`, `refactor/…`.
2. Keep PRs small and focused. One concern per PR.
3. All CI gates must pass — they block merge by design:
   `lint · typecheck · test · build · JS↔Python parity`.
4. Update docs/ADRs when a decision or interface changes.

## Code standards

- TypeScript strict; no unjustified `any` (lint error).
- Respect the layering: `domain ← application ← {infrastructure, presentation}`.
  Add a **port** rather than importing an outer layer into the core.
- Components stay small and presentational; logic lives in use cases and pure
  functions.
- Model expected failures with `Result<T,E>`; reserve exceptions for programmer
  errors.
- Every new screen/component ships with an accessibility pass (keyboard, focus,
  labels, contrast, reduced motion).

## Commits

Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).

## Tests

Add or update tests for any behavior change. Critical paths (DSP, inference,
domain rules, the analyze use case, JS/Python parity) must stay green. Run
`npm test` before pushing.

## Reporting issues

Include: environment (browser + OS, **note iOS/Safari specifically**), steps,
expected vs actual, and a sample audio file when the issue is analysis-related.
