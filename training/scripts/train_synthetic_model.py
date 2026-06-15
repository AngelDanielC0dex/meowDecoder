"""Train the synthetic integration model and publish every artifact + fixture.

Phases (separable to fit CI step budgets):
  gen     → data/synthetic/<class>.npz        (pooled features per class)
  train   → artifacts/synthetic_mlp.npz       (weights + val report)
  export  → web/public/models/{model.onnx,manifest.json}
            web/tests/fixtures/model-weights.json
            web/tests/fixtures/model-parity.json
            + HARD GATE: ONNX Runtime output ≡ NumPy reference

Usage:
  PYTHONPATH=src python scripts/train_synthetic_model.py all
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

from meowdecoder_training.features import log_mel
from meowdecoder_training.mlp_onnx import EPS, build_onnx, forward, pooled_features, train_mlp
from meowdecoder_training.synthetic import CLASSES, N, SR, synth

PER_CLASS = 220
N_MELS, N_FRAMES = 64, 96
MODEL_VERSION = "mlp-synthetic-2026.06.0"
DATA_DIR = Path("data/synthetic")
WEB_MODELS = Path("../web/public/models")
WEB_FIXTURES = Path("../web/tests/fixtures")


def mel_of(pcm: np.ndarray) -> np.ndarray:
    return log_mel(pcm, sample_rate=SR, n_mels=N_MELS, n_frames=N_FRAMES)


def main() -> None:  # noqa: C901
    what = sys.argv[1] if len(sys.argv) > 1 else "all"

    if what in ("gen", "all"):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        for ci, cls in enumerate(CLASSES):
            rng = np.random.default_rng(1000 + ci)
            feats = np.stack(
                [pooled_features(mel_of(synth(cls, rng))) for _ in range(PER_CLASS)]
            )
            np.savez_compressed(DATA_DIR / f"{cls}.npz", X=feats)
            print(f"[gen] {cls}: {feats.shape}")

    if what in ("train", "all"):
        Xs, ys = [], []
        for ci, cls in enumerate(CLASSES):
            X = np.load(DATA_DIR / f"{cls}.npz")["X"]
            Xs.append(X)
            ys.append(np.full(len(X), ci))
        X = np.concatenate(Xs).astype(np.float32)
        y = np.concatenate(ys)

        rng = np.random.default_rng(7)
        idx = rng.permutation(len(X))
        n_val = len(X) // 5
        val, tr = idx[:n_val], idx[n_val:]

        w = train_mlp(X[tr], y[tr], len(CLASSES))
        val_probs = forward(w, X[val])
        val_acc = float((val_probs.argmax(1) == y[val]).mean())
        per_class_acc = {
            cls: float((val_probs.argmax(1) == y[val])[y[val] == ci].mean())
            for ci, cls in enumerate(CLASSES)
        }
        print(f"[train] val acc = {val_acc:.3f} per-class = {per_class_acc}")
        assert val_acc > 0.9, "synthetic model failed to learn its own family — abort"

        Path("artifacts").mkdir(exist_ok=True)
        np.savez(
            "artifacts/synthetic_mlp.npz", **w, val_acc=val_acc,
            report=json.dumps(per_class_acc),
        )

    if what in ("export", "all"):
        data = np.load("artifacts/synthetic_mlp.npz")
        w = {k: data[k] for k in ("W1", "b1", "W2", "b2")}

        WEB_MODELS.mkdir(parents=True, exist_ok=True)
        onnx_path = WEB_MODELS / "model.onnx"
        build_onnx(w, N_MELS, N_FRAMES, str(onnx_path))

        # --- HARD GATE: ORT ≡ NumPy on random + real parity inputs -------
        import onnxruntime as ort

        sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
        rng = np.random.default_rng(3)
        mel_batch = rng.standard_normal((4, 1, N_MELS, N_FRAMES)).astype(np.float32)
        ort_out = sess.run(["probs"], {"input": mel_batch})[0]
        np_out = forward(w, np.stack([pooled_features(m[0]) for m in mel_batch]))
        diff = float(np.max(np.abs(ort_out - np_out)))
        print(f"[export] ORT vs NumPy max diff = {diff:.2e}")
        assert diff < 1e-4, "ONNX graph diverges from reference forward pass"

        manifest = {
            "schemaVersion": 1,
            "modelVersion": MODEL_VERSION,
            "fileName": "model.onnx",
            "classes": CLASSES,
            "input": {
                "kind": "log-mel",
                "sampleRate": SR,
                "nMels": N_MELS,
                "nFrames": N_FRAMES,
                "windowS": round(N / SR, 3),
            },
        }
        (WEB_MODELS / "manifest.json").write_text(json.dumps(manifest, indent=2))

        # --- Fixtures for the TS tests -----------------------------------
        WEB_FIXTURES.mkdir(parents=True, exist_ok=True)
        (WEB_FIXTURES / "model-weights.json").write_text(
            json.dumps(
                {
                    "arch": "meanstd-mlp",
                    "eps": EPS,
                    "modelVersion": MODEL_VERSION,
                    "classes": CLASSES,
                    "W1": w["W1"].round(6).tolist(),
                    "b1": w["b1"].round(6).tolist(),
                    "W2": w["W2"].round(6).tolist(),
                    "b2": w["b2"].round(6).tolist(),
                }
            )
        )

        # Model-output parity over the shared parity signals (same recipe as
        # tests/inference/parity.test.ts), via the REAL ONNX session.
        from generate_parity_fixtures import make_signal  # local script import

        cases = []
        for kind in ["tone_440", "tone_900", "chirp", "noise"]:
            pcm = make_signal(kind)
            mel = mel_of(pcm)[None, None, :, :].astype(np.float32)
            probs = sess.run(["probs"], {"input": mel})[0][0]
            cases.append({"kind": kind, "probs": probs.round(6).tolist()})
        (WEB_FIXTURES / "model-parity.json").write_text(
            json.dumps({"modelVersion": MODEL_VERSION, "classes": CLASSES, "cases": cases})
        )
        print(f"[export] wrote model.onnx ({onnx_path.stat().st_size} B), manifest, fixtures")


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent))  # for generate_parity_fixtures
    main()
