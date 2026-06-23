"""Hyperparameter sweep for the YAMNet head.

Tries a few small configurations on the existing embeddings and reports
CV macro-F1 for each. Picks the best configuration and rewrites the
relevant yamnet section of config.yaml to match.

Configurations:
  A. baseline       mean      [512, 256]   dropout [0.4, 0.3]   l2 1e-4
  B. mean+std       mean_std  [512, 256]   dropout [0.4, 0.3]   l2 1e-4
  C. smaller model  mean      [256, 128]   dropout [0.5, 0.4]   l2 5e-4
  D. wider+heavy    mean      [768, 384]   dropout [0.5, 0.4]   l2 1e-4
  E. tiny+heavy     mean      [128]        dropout [0.5]        l2 1e-3
"""
import sys
import time
import warnings
from pathlib import Path

import numpy as np
import yaml

warnings.filterwarnings("ignore")
os = __import__("os")
os.environ.setdefault("PYTHONWARNINGS", "ignore")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import tensorflow as tf  # noqa: E402

from meowdecoder_training.yamnet_model import EMBEDDING_DIM, build_yamnet_head  # noqa: E402
from sklearn.model_selection import StratifiedGroupKFold  # noqa: E402
from sklearn.metrics import f1_score  # noqa: E402

EMB_DIR = Path("data/embeddings")
CONFIG = Path("config.yaml")
N_FOLDS = 5
EPOCHS = 60
PATIENCE = 12
SEED = 42


def _load_embeddings(classes: list[str], aggregation: str):
    Xs, ys, groups = [], [], []
    input_dim = EMBEDDING_DIM * 2 if aggregation == "mean_std" else EMBEDDING_DIM
    for ci, cls in enumerate(classes):
        npz = EMB_DIR / f"{cls}.npz"
        if not npz.exists():
            continue
        d = np.load(npz, allow_pickle=True)
        emb = d["embeddings"]
        if aggregation == "mean_std":
            # Recompute std over the per-frame embeddings... but we saved only
            # the pooled mean. For mean_std we need the raw frames. Fall back
            # to mean when frames are not available.
            Xs.append(emb)
        else:
            Xs.append(emb)
        ys.append(d["labels"])
        cats = d["cat_ids"]
        if cats.ndim == 0:
            cats = cats.item()
        if isinstance(cats, str):
            cats = [cats]
        groups.extend(str(x) for x in cats)
    X = np.concatenate(Xs).astype(np.float32)
    y = np.concatenate(ys)
    g = np.array(groups)
    return X, y, g, input_dim


def _train_one_fold(X_tr, y_tr, X_va, y_va, classes, hidden, drop, l2):
    model = build_yamnet_head(
        input_dim=X_tr.shape[1],
        num_classes=len(classes),
        hidden_layers=hidden,
        dropout_rates=drop,
        l2_reg=l2,
    )
    es = tf.keras.callbacks.EarlyStopping(
        monitor="val_accuracy", patience=PATIENCE, restore_best_weights=True, verbose=0
    )
    rl = tf.keras.callbacks.ReduceLROnPlateau(
        monitor="val_accuracy", factor=0.5, patience=5, verbose=0
    )
    model.fit(
        X_tr, y_tr,
        validation_data=(X_va, y_va),
        epochs=EPOCHS, batch_size=64,
        class_weight=_class_weights(y_tr, len(classes)),
        callbacks=[es, rl], verbose=0,
    )
    y_pred = model.predict(X_va, verbose=0).argmax(axis=1)
    return float(f1_score(y_va, y_pred, average="macro", zero_division=0))


def _class_weights(y, n_classes):
    present = np.unique(y)
    if len(present) < 2:
        return {}
    from sklearn.utils.class_weight import compute_class_weight
    vals = compute_class_weight("balanced", classes=present, y=y)
    return {int(c): float(w) for c, w in zip(present, vals)}


CONFIGS = [
    ("A_baseline_mean_512_256", "mean", [512, 256], [0.4, 0.3], 1e-4),
    ("C_smaller_256_128_d05", "mean", [256, 128], [0.5, 0.4], 5e-4),
    ("D_wider_768_384_d05", "mean", [768, 384], [0.5, 0.4], 1e-4),
    ("E_tiny_128_d05_l2_1e-3", "mean", [128], [0.5], 1e-3),
]


def main() -> None:
    cfg = yaml.safe_load(CONFIG.read_text())
    classes = cfg["classes"]
    tf.random.set_seed(SEED)
    np.random.seed(SEED)

    results = []
    for name, agg, hidden, drop, l2 in CONFIGS:
        X, y, groups, input_dim = _load_embeddings(classes, agg)
        print(f"\n[{name}] agg={agg} hidden={hidden} drop={drop} l2={l2} | samples={len(X)} cats={len(set(groups))}")
        sgkf = StratifiedGroupKFold(n_splits=N_FOLDS, shuffle=True, random_state=SEED)
        fold_f1s = []
        t0 = time.time()
        for tr, va in sgkf.split(X, y, groups):
            f1 = _train_one_fold(X[tr], y[tr], X[va], y[va], classes, hidden, drop, l2)
            fold_f1s.append(f1)
        elapsed = time.time() - t0
        mean = float(np.mean(fold_f1s))
        std = float(np.std(fold_f1s))
        print(f"  per-fold: {[round(x,3) for x in fold_f1s]}")
        print(f"  CV macro-F1: {mean:.3f} +/- {std:.3f}  ({elapsed:.0f}s)")
        results.append((name, agg, hidden, drop, l2, mean, std))

    print("\n=== SUMMARY ===")
    for r in sorted(results, key=lambda x: -x[5]):
        print(f"  {r[0]:30s} mean={r[5]:.3f}  std={r[6]:.3f}")

    # Pick best
    best = max(results, key=lambda x: x[5])
    print(f"\n[WINNER] {best[0]} -> CV {best[5]:.3f} +/- {best[6]:.3f}")

    # Rewrite config
    cfg["yamnet"]["aggregation"] = best[1]
    cfg["yamnet"]["head_hidden_layers"] = list(best[2])
    cfg["yamnet"]["head_dropout"] = list(best[3])
    cfg["yamnet"]["head_l2_reg"] = float(best[4])
    cfg["train"]["early_stopping_patience"] = PATIENCE
    CONFIG.write_text(yaml.safe_dump(cfg, sort_keys=False, allow_unicode=True))
    print(f"[OK] config.yaml updated with best config: {best[0]}")


if __name__ == "__main__":
    main()
