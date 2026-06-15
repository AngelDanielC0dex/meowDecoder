# MeowDecoder — Training pipeline

Trains the feline vocalization classifier and exports it to ONNX for in-browser
inference. The browser ships the heuristic engine until a model is published
here, so this pipeline is what graduates the product from E1 → E2.

## Setup

```bash
cd training
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
```

## Model Architecture (Transfer Learning)

This pipeline uses **Transfer Learning** based on `MobileNetV2` via `torchvision`. We adapt the base vision model to process 1-channel log-mel spectrograms (64x96) and fine-tune its classification head for 6 feline vocalization classes.

## Data

1. Download **CatMeows** (Zenodo 4008297) into `data/raw/catmeows/`.
2. Add curated `hiss` / `growl` / `yowl` / `purr` / `trill` clips. We highly recommend utilizing open-source datasets like the **Kaggle Cat Sound Classification** datasets for the classes missing in CatMeows. Place them into `data/raw/<class>/`.
3. Process:

```bash
python scripts/prepare_catmeows.py --raw data/raw/catmeows --out data/processed
# repeat per extra class with --label <class>
```

Processed layout: `data/processed/<class>/<cat_id>__<uuid>.wav` (mono, 16 kHz).
The `<cat_id>` prefix drives the **grouped split** that prevents the same cat
leaking across train/validation.

## Train → export

```bash
python -m meowdecoder_training.train  --config config.yaml   # → artifacts/model.pt
python -m meowdecoder_training.export --config config.yaml   # → web/public/models/
```

Export runs two hard gates: ONNX-Runtime vs PyTorch parity, and INT8 vs fp32
parity. A divergence fails the command (and CI).

## Metrics

Primary **macro-F1** (classes are imbalanced); secondary **ECE** for calibration
(the confidence the UI shows must mean something). Validation is 5-fold
`StratifiedGroupKFold` grouped by cat id.

## Feature parity

`features.py` is the byte-for-byte sibling of `web/src/infrastructure/inference/
log-mel.ts`. Regenerate the shared fixtures after any change:

```bash
python scripts/generate_parity_fixtures.py   # → web/tests/fixtures/parity.json
```

The web test `tests/parity.test.ts` then enforces JS≈Python in CI.

## Limitations

Public feline datasets are small (~10³ clips). Expect a usable but modest model;
the real moat is the opt-in user feedback/donation loop that grows a proprietary
dataset over time. Do not overclaim accuracy.
