# Development guide

## Prerequisites

- Node.js ≥ 20, npm
- Python ≥ 3.10 (only for the ML pipeline)
- A modern browser for manual testing (Chromium, Firefox, **and Safari/iOS** —
  Web Audio/MediaRecorder differ there; treat iOS as a first-class test target).

## Running the app

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

Visit `http://localhost:3000` → middleware redirects to `/es` or `/en`.

## Project conventions

- **Layering.** `domain ← application ← {infrastructure, presentation}`.
  `domain/` and `application/` import nothing from outer layers (ESLint enforces
  this via `no-restricted-imports`). Need a capability in the core? Add a **port**
  in `application/ports` and implement it in `infrastructure`.
- **Files** are `kebab-case.ts`; React components `PascalCase.tsx`. One primary
  export per file.
- **No business logic in components.** Components call hooks; hooks call use
  cases; use cases orchestrate ports. Pure functions (`dsp/`, `domain/`) carry
  the logic and are unit-tested without mocks.
- **Types.** `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
  No unjustified `any` (lint error). Model expected failures with `Result<T,E>`,
  not exceptions.
- **State.** Local state by default. The only global store is the analysis flow
  (`presentation/state/analysis-store.ts`). Don't add global state without a
  cross-component, cross-navigation reason.

## Testing

```bash
npm test            # vitest run
npm run test:watch  # watch mode
```

Critical-path coverage: FFT, VAD/segmentation, feature extraction, the heuristic
classifier, domain rules, the `analyzeAudio` use case (with in-memory fakes), and
**JS↔Python feature parity** (`tests/inference/parity.test.ts`). Regenerate parity
fixtures from the training repo after any feature change:

```bash
cd training && PYTHONPATH=src python scripts/generate_parity_fixtures.py
```

## Adding a vocalization class

1. Add it to `web/src/domain/analysis/vocalization.ts`.
2. Add curated bilingual content (description, contexts, FAQs) to
   `web/src/content/vocalizations.ts` — this single source feeds the result UI,
   the SEO page, the footer and the sitemap automatically.
3. Add a scoring function in `infrastructure/inference/heuristic-engine.ts`
   (and/or retrain the model + bump `classes` in `config.yaml`).
4. Add a unit test in `tests/inference/heuristic.test.ts`.

## Database (backend)

```bash
npm run db:generate   # drizzle-kit: generate a migration from schema.ts
npm run db:migrate    # apply migrations
```

Never edit a committed migration — append a new one. The IndexedDB schema follows
the same rule (`infrastructure/persistence/db.ts`).

## Accessibility checklist (every PR)

Keyboard reachable, visible focus, labelled controls, semantic landmarks, ≥44px
tap targets, `prefers-reduced-motion` respected, color contrast ≥ AA. Run an axe
pass on changed screens.
