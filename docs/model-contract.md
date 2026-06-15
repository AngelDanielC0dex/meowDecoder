# Model Contract v1 (frozen)

Source of truth in code: `web/src/domain/analysis/contract.ts`.
Enforced by: `web/tests/inference/model-contract.test.ts` (manifest ↔ contract),
`model-parity.test.ts` (Python ↔ ONNX ↔ TS numerics) and
`model-regression.test.ts` (model ≥ heuristic baseline).

## 1. Input

| Property | Value |
|---|---|
| Audio | mono PCM, 16 000 Hz, peak-normalized −1 dBFS |
| Features | log-mel spectrogram, **64 mels × 96 frames** (frame 512, hop 256, Hann, mel 50 Hz–8 kHz, `log(x+1e-6)`) |
| Normalization | per-example standardization (mean 0, std 1) |
| Tensor | `float32 [batch, 1, 64, 96]`, input name **`input`** |

The TS extractor (`infrastructure/inference/log-mel.ts`) and the Python extractor
(`training/.../features.py`) are pinned to each other by the parity fixtures.

## 2. Output

Tensor `float32 [batch, 6]`, name **`probs`**, softmax distribution over, in
this exact order:

```
0 meow · 1 purr · 2 trill · 3 hiss · 4 growl · 5 yowl
```

`unknown` is **not** a model class — see §4.

## 3. Confidence thresholds (all engines, identical)

| Certainty | Condition |
|---|---|
| high | top-1 ≥ **0.70** and (top-1 − top-2) ≥ **0.15** |
| medium | top-1 ≥ **0.45** |
| low | top-1 < **0.45** |
| `ambiguous` flag | certainty low **or** margin < 0.15 |

## 4. `unknown` behavior

When certainty is **low**, the engine demotes the top class to first alternative
and emits `unknown` as primary (keeping the original top-1 probability so the UI
can show how weak the best guess was). Applied by `applyUnknownPolicy()` in both
the heuristic and the ONNX engine — the product never asserts a class it isn't
reasonably sure of.

## 5. Manifest (`web/public/models/manifest.json`)

```json
{
  "schemaVersion": 1,
  "modelVersion": "<semver-ish string>",
  "fileName": "model.onnx",
  "classes": ["meow","purr","trill","hiss","growl","yowl"],
  "input": { "kind": "log-mel", "sampleRate": 16000, "nMels": 64, "nFrames": 96, "windowS": 1.552 }
}
```

The frontend refuses any manifest whose `schemaVersion`/`input.kind` it doesn't
support and falls back to the heuristic — a bad model deploy can never take the
product down. Changing anything in §§1–4 requires `schemaVersion: 2` plus a
frontend release that supports both.

## 6. Engine roles

- **`heuristic-dsp`** — rule-based over acoustic features. Always available,
  zero download. Serves as **fallback** (model missing/incompatible/failed) and
  as the **regression baseline** every model must beat or match.
- **`cnn-onnx`** — any ONNX model satisfying this contract. Activated by setting
  `NEXT_PUBLIC_MODEL_BASE_URL`; loaded lazily, cached in IndexedDB.

## 7. Current published model — read this

`mlp-synthetic-2026.06.0` is a real, fully-verified ONNX model (mean/std-pooled
MLP, 35 KB) **trained on parametric synthetic signals** that mirror each class's
acoustic signature — not on real cat recordings, because no public dataset was
available in the build environment. Its job is to validate the entire chain
(training → export → manifest → browser inference → parity → regression) and
freeze this contract. **Before relying on it for real-world quality, train the
CNN on CatMeows + curated data** (`training/README.md`); the export emits the
same manifest, so swapping it in requires zero frontend changes. Verified gates
for the current artifact: ONNX-Runtime ≡ NumPy (1.8e-07), TS runner ≡ ONNX
(fixtures), macro-F1 ≥ baseline on the held-out synthetic family.

## 8. Regression gate (CI)

`model-regression.test.ts` evaluates both engines on a deterministic eval set
(8×6 signals, seeded) and fails if `macroF1(model) < macroF1(heuristic) − 0.02`
or `macroF1(model) < 0.70`. A model that cannot match the rule-based baseline
does not ship.
