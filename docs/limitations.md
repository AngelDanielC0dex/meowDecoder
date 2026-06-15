# Known limitations & honest scope

We hold ourselves to claiming only what the science and the system support.

## Product framing

- MeowDecoder is a **vocalization classifier with contextual interpretation**,
  not a literal translator. Feline bioacoustics research supports classifying
  vocalization *type* and inferring *approximate context* — not word-for-word
  meaning. We never present output as a definitive statement of what a cat
  "said."
- `unknown` is a real, first-class outcome. Low-confidence or ambiguous signals
  are surfaced as such rather than forced into a class.

## Model / accuracy

- The shipped default is a **rule-based DSP engine**. It reliably separates
  acoustically distinct categories (purr vs hiss vs meow vs growl/yowl) but does
  **not** resolve fine sub-contexts of a meow (e.g. "food" vs "door"). That
  requires the trained model and richer data.
- Public feline datasets are small (~10³ labeled clips). The first trained model
  will be useful but modest. The durable advantage is the **opt-in feedback and
  audio-donation loop** that grows a proprietary, per-cat dataset over time.
- Confidence is calibrated (temperature scaling) but remains an estimate. Treat
  it as guidance.

## Platform / audio

- **iOS Safari** constrains `MediaRecorder` formats and Web Audio behavior. We
  negotiate the best available format and decode via `OfflineAudioContext`, but
  some older iOS versions may still fail capture; the file-upload path is the
  fallback.
- Very noisy environments or distant recordings degrade segmentation. The UI
  guides the user toward a closer, quieter recording.
- WebGPU acceleration is used when present; otherwise WASM+SIMD. First inference
  pays a one-time runtime/model download (then cached in IndexedDB).

## Privacy / data

- Audio is processed on-device and is **not** uploaded unless the user explicitly
  donates a sample for training. The backend stores features and predictions, not
  raw audio, by default.

## Not yet implemented (by design — see roadmap in ARCHITECTURE.md)

Per-cat personalization (priors), continuous monitor, payments, audio sync, and
the trained ONNX model are scaffolded but not active in E1. Their interfaces
exist so adding them needs no rewrite.
