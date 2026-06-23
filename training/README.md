# MeowDecoder — Training Pipeline (YAMNet Transfer Learning, 10 Classes)

> **Sources of truth:** this README (pipeline) + `../ROADMAP.md` (live task list)
> + `../docs/model-contract.md` (the frozen model contract). Current method:
> StratifiedGroupKFold by cat_id with **pooled OOF macro-F1**, final model
> **retrained on all data**, **StandardScaler** (required at inference/ONNX),
> per-class **threshold calibration**, prosodic features (head input 2073-dim),
> and AudioSet-based data cleaning (`filter_by_audioset.py --strict`).

Trains the feline vocalization classifier and exports it to ONNX for in-browser
inference. Uses **YAMNet** (pretrained on AudioSet) as a frozen feature extractor,
with a custom Dense head for 11 emotional/behavioral classes.

## Setup

```bash
cd training
python -m venv .venv
.\.venv\Scripts\Activate.ps1       # Windows
# source .venv/bin/activate        # Linux/macOS
pip install -e ".[dev]"
pip install -e ".[yamnet]"         # TensorFlow + YAMNet dependencies
```

## Model Architecture

**YAMNet Transfer Learning** (waveform input, not log-mel spectrograms):
- **Base**: YAMNet from TensorFlow Hub (frozen, ~14M params)
  - Input: 16kHz mono waveform
  - Output: 1024-dim embedding per 0.48s frame
- **Head**: Custom Dense classifier (660K params, trainable)
  - Input: Mean-pooled 1024-dim embedding
  - Dense(512) → BN → ReLU → Dropout(0.4)
  - Dense(256) → BN → ReLU → Dropout(0.3)
  - Dense(11) → Softmax

Two export modes (both supported):
1. **Offline extraction** (recommended for training): Extract embeddings once, train head separately
2. **Dual ONNX export** (for production): `yamnet.onnx` + `meow_decoder_head_int8.onnx`

## 10 Classes

`caza` was merged into `trinos` (hunting chatter ≈ chirp/trill acoustically) and
Meow-10K was evaluated and dropped (noisy intent labels). Sources today:
Pandeya/NAYA + CatMeows + targeted Freesound + YouTube (`fetch_quarantine.py`).

| Index | Class | Dataset Source |
|---|---|---|
| 0 | feliz_contento | Pandeya/NAYA `Happy/` + CatMeows (B) |
| 1 | trinos | Pandeya/NAYA `HuntingMind/` + Freesound (chirp/trill) |
| 2 | enfadado | Pandeya/NAYA `Angry/` |
| 3 | pelea | Pandeya/NAYA `Fighting/` |
| 4 | llamada_madre | Pandeya/NAYA `MotherCall/` + Freesound |
| 5 | llamada_apareamiento | Pandeya/NAYA `Mating/` + Freesound |
| 6 | dolor | Pandeya/NAYA `Paining/` + CatMeows (I) |
| 7 | descansando | Pandeya/NAYA `Resting/` |
| 8 | advertencia | Pandeya/NAYA `Warning/` + `Defence/` |
| 9 | atencion | CatMeows (F) + YouTube demand meows |

## Data

1. Download **Pandeya Cat Sound Classification V2** (12 GB):
   - Kaggle: https://www.kaggle.com/datasets/yagtapandeya/cat-sound-classification-dataset
   - Zenodo: https://zenodo.org/records/4724180
2. Download **CatMeows** (440 samples, 21 cats):
   - Zenodo: https://zenodo.org/records/4008297
3. Download **Meow-10K**:
   - Hugging Face: https://huggingface.co/datasets/smgjch/meow-10k
4. Optional: Freesound.org API for supplemental data

Process:
```bash
python scripts/prepare_pandeya.py --raw data/raw/pandeya --out data/processed
python scripts/prepare_catmeows.py --raw data/raw/catmeows --out data/processed --label feliz_contento --context-filter B
python scripts/prepare_catmeows.py --raw data/raw/catmeows --out data/processed --label atencion --context-filter F
python scripts/prepare_catmeows.py --raw data/raw/catmeows --out data/processed --label dolor --context-filter I
python scripts/ingest_freesound.py --out data/raw/freesound --max-per-class 25
```

## Train → Export

```bash
# Step 1: Extract YAMNet embeddings (offline, one-time)
python -m meowdecoder_training.yamnet_pipeline extract --config config.yaml

# Step 2: Train classifier head with LOCO validation
python -m meowdecoder_training.yamnet_pipeline train --config config.yaml

# Step 3: Evaluate
python -m meowdecoder_training.yamnet_pipeline evaluate --config config.yaml

# Step 4: Export head to ONNX + INT8 quantization
python -m meowdecoder_training.export_yamnet_head --config config.yaml

# Step 5: Export YAMNet base to ONNX
python -m meowdecoder_training.export_yamnet_onnx --output ../web/public/models/yamnet.onnx
```

## Legacy: CNN / MLP (v1)

The original 6-class CNN (`model.py`) and synthetic MLP (`mlp_onnx.py`) are
retained for backward compatibility but are superseded by the YAMNet pipeline.
The synthetic integration test still uses them via `scripts/train_synthetic_model.py`.

## Full Training Guide

For the end-to-end deployment guide (data prep → train → export → publish) see
`../DEPLOYMENT.md` (FASE 1). The live task list is in `../ROADMAP.md`.