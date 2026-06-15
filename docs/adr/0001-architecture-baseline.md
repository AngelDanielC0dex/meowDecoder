# ADR 0001 — Architecture baseline

- **Status:** Accepted
- **Date:** 2026-06-12

## Context

We are building a production-grade feline acoustic intelligence platform meant to
last and evolve over years, not a demo. Core constraints: TypeScript frontend,
clean modular architecture, accessible mobile-first UI, technical SEO from day
one, optimized in-browser inference that never blocks the main thread, minimal
dependencies, and readiness for personalization, monetization and observability.

## Decisions

1. **Next.js 15 (App Router, RSC) + TypeScript strict.** SSG/RSC gives crawlable,
   JS-free landing and content pages; one deploy covers the thin backend. Strict
   TS (+ `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) eliminates a
   class of array/DSP bugs.
2. **Clean Architecture with enforced layering** (`domain ← application ←
   {infrastructure, presentation}`). Keeps ML/DSP/persistence swappable and
   business logic out of components.
3. **Local-first.** The full analysis flow runs on-device (privacy, cost,
   latency, offline). The backend is additive (sync, personalization, feedback
   aggregation), not required.
4. **Engine-agnostic inference behind a port.** A rule-based DSP engine ships in
   E1; an ONNX CNN (onnxruntime-web, WASM+SIMD default, WebGPU progressive)
   plugs into the same port with graceful fallback. The product never depends on
   a single ML strategy.
5. **Web Worker for batch DSP; AudioWorklet only for live metering.** Native
   `OfflineAudioContext` for decode/resample. Nothing heavy on the main thread.
6. **Zustand for the one cross-cutting flow (analysis); local state otherwise.**
7. **IndexedDB via `idb`** with versioned, append-only migrations for cats,
   sessions, feedback, settings and the model cache.
8. **Postgres + Drizzle** as a thin backend inside Next route handlers; extract a
   separate service only when load demands it.
9. **PyTorch → ONNX → INT8** training pipeline with feature parity tested against
   the TS implementation in CI.
10. **Bilingual (es/en) from the start** via next-intl localized routing; a typed
    knowledge base is the single source of truth for the result UI and
    programmatic SEO pages.

## Consequences

- High testability: pure domain/DSP, ports + fakes for use cases.
- Model updates ship without frontend releases (manifest negotiation).
- Some upfront structure cost, repaid by years of low-friction evolution.
- The main risk (small public datasets) is mitigated by an honest heuristic
  baseline plus a feedback/donation loop that compounds into a data moat.
