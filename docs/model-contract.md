# Model Contract v2 — 10-Class YAMNet Transfer Learning

Source of truth in code: `web/src/domain/analysis/contract.ts`.
Enforced by: `web/tests/inference/model-contract.test.ts` (manifest ↔ contract),
`web/tests/inference/model-regression.test.ts` (heuristic baseline).

## 1. Input

| Property | Value |
|---|---|
| Audio | mono PCM, 16 000 Hz, peak-normalized |
| Feature extraction | YAMNet ONNX (waveform → 1024-dim embedding, 0.48s hop) |
| Aggregation | Mean pooling over frames per clip |
| Head input | Float32 `[batch, 1024]`, name **`embedding_input`** |

The YAMNet ONNX model processes raw waveform internally (STFT → mel filterbank →
log-mel → MobileNet backbone). The frontend does NOT compute log-mel; it feeds
16 kHz mono PCM directly to YAMNet.

> **Prosodic features (training, not yet in the deployed ONNX).** The offline
> training pipeline now aggregates `mean+std` (2048) and concatenates **25
> prosodic features** (F0 contour, jitter, shimmer, HNR, spectral, duration) →
> **2073-dim** head input. These capture what YAMNet discards and separate the
> "meow family" (happy/demand/pain). When the prosodic ONNX is exported, this
> contract's head input becomes `[batch, 2073]` and the browser must compute the
> same 25 features in JS (parity test required) before the ONNX engine is enabled.
> Until then the deployed/default engine is the heuristic DSP.

## 2. Output

Tensor `float32 [batch, 10]`, name **`softmax_logits`**, softmax distribution over,
in this exact order:

```
0 feliz_contento · 1 trinos · 2 enfadado · 3 pelea · 4 llamada_madre
5 llamada_apareamiento · 6 dolor · 7 descansando · 8 advertencia · 9 atencion
```

(`caza` was merged into `trinos` and no longer exists.) `unknown` is **not** a
model output — see §4.

## 3. Temporal Smoothing

YAMNet produces one 1024-dim embedding per 0.48s frame. Raw per-frame
classifications are unreliable due to "semantic alliteration" (e.g., purr
signals both happiness and pain). A 3-second EMA smoothing window is applied
before emitting a final classification:

- **EMA alpha**: 0.3
- **Min frames**: 6 (~2.88s) before emitting a confident prediction
- **Reset**: after 2+ seconds of silence (new vocalization)

## 4. Confidence thresholds (all engines, identical)

| Certainty | Condition |
|---|---|
| high | top-1 ≥ **0.70** and (top-1 − top-2) ≥ **0.15** |
| medium | top-1 ≥ **0.45** |
| low | top-1 < **0.45** |
| `ambiguous` flag | certainty low **or** margin < 0.15 |

## 5. `unknown` behavior

When certainty is **low**, the engine demotes the top class to first alternative
and emits `unknown` as primary, preserving the real top-1 probability so the UI
can show how weak the best guess was. Applied by `applyUnknownPolicy()` in both
the heuristic and the ONNX engine.

## 6. Manifest (`web/public/models/manifest.json`)

```json
{
  "schemaVersion": 2,
  "modelVersion": "yamnet-11cls-2026.06.0",
  "architecture": "yamnet-transfer-learning",
  "headModel": "meow_decoder_head_int8.onnx",
  "yamnetModel": "yamnet.onnx",
  "classes": [
    "feliz_contento","trinos","enfadado","pelea","llamada_madre",
    "llamada_apareamiento","dolor","descansando","advertencia","atencion"
  ],
  "input": {
    "kind": "waveform",
    "sampleRate": 16000,
    "channels": 1,
    "embeddingDim": 1024,
    "yamnetFrameS": 0.96,
    "yamnetHopS": 0.48
  },
  "output": {
    "kind": "softmax",
    "numClasses": 11,
    "tensorOutputName": "softmax_logits"
  },
  "smoothing": {
    "windowS": 3.0,
    "emaAlpha": 0.3,
    "minConfidence": 0.45
  }
}
```

The frontend refuses any manifest whose `schemaVersion` or `input.kind` it
doesn't support and falls back to the heuristic. Changing anything in §§1–5
requires `schemaVersion: 3` plus a frontend release supporting both.

## 7. Engine roles

- **`heuristic-dsp`** — rule-based over acoustic features (10 classes). Always
  available, zero download. Serves as **fallback** and **regression baseline**.
- **`yamnet-onnx`** — YAMNet feature extractor ONNX + classifier head ONNX.
  Activated by setting `NEXT_PUBLIC_MODEL_BASE_URL`; loaded lazily, cached in
  IndexedDB. Two models downloaded: `yamnet.onnx` (~14 MB) and
  `meow_decoder_head_int8.onnx` (~650 KB).

## 8. Regression gate (CI)

`model-regression.test.ts` evaluates both engines on deterministic features and
fails if `macroF1(model) < macroF1(heuristic) - 0.02` or `macroF1(model) < 0.70`.

## 9. v1 → v2 migration notes

| Aspect | v1 | v2 |
|---|---|---|
| Classes | 6 (meow, purr, trill, hiss, growl, yowl) | 10 emotional/behavioral states (+ `unknown` product policy) |
| Model input | log-mel spectrogram `[1,1,64,96]` | waveform `float32[]` 16kHz |
| Model architecture | CNN / mean-pooled MLP | YAMNet + Dense head (transfer learning) |
| Feature extraction | `log-mel.ts` (frontend) | YAMNet ONNX (frontend) |
| Time smoothing | None | EMA over 3s window |
| ONNX models | 1 (`model.int8.onnx`) | 2 (`yamnet.onnx` + `meow_decoder_head_int8.onnx`) |
| Schema version | 1 | 2 |