"""YAMNet embedding extraction and classifier head training pipeline.

Rewritten (2026-06) to fix the LOCO measurement and model-selection bugs:

  * Out-of-fold (OOF) pooled evaluation: a SINGLE global macro-F1 over the
    concatenated validation predictions of every fold, instead of averaging
    per-fold macro-F1 (which was pessimistic and incomparable across folds).
  * The deployed model is RE-TRAINED on ALL data after CV. We no longer save
    the weights of whichever single fold scored highest (selection bias +
    trained on incomplete data).
  * Feature standardization with StandardScaler, fit on TRAIN only inside each
    fold and on ALL data for the final model. The scaler is persisted so the
    ONNX/front inference can reproduce it.
  * Early stopping / LR schedule driven by macro-F1, not accuracy.
  * Learning rate, majority-class cap and CV protocol come from config.
  * Two CV protocols: StratifiedGroupKFold (primary, grouped by cat_id) and a
    LOCO "anchor" protocol restricted to cats that actually have >=2 classes.

Usage:
  python -m meowdecoder_training.yamnet_pipeline extract  --config config.yaml
  python -m meowdecoder_training.yamnet_pipeline train    --config config.yaml
  python -m meowdecoder_training.yamnet_pipeline train    --config config.yaml --protocol loco
  python -m meowdecoder_training.yamnet_pipeline train    --config config.yaml --cv-folds 5
  python -m meowdecoder_training.yamnet_pipeline evaluate  --config config.yaml
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np
import yaml

try:
    import tensorflow_hub as hub
    import tensorflow as tf

    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False

from sklearn.metrics import f1_score, classification_report, confusion_matrix
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.preprocessing import StandardScaler
from sklearn.utils.class_weight import compute_class_weight

from .yamnet_model import EMBEDDING_DIM, build_yamnet_head


# ---------------------------------------------------------------------------
# Small, TF-free helpers (unit-testable without TensorFlow)
# ---------------------------------------------------------------------------

_SEG_RE = re.compile(r"_seg\d+$")
_STRICT_NAME_RE = re.compile(r"^(?P<cat>.+)__[a-f0-9]{8}\.wav$")
_FALLBACK_NAME_RE = re.compile(r"^(?P<cat>.+)__")

GENERIC_TOKENS = {"car", "cat", "Cat", "unknown", "sound", "audio"}


def _strip_seg_suffix(cat_id: str) -> str:
    return _SEG_RE.sub("", cat_id)


def parse_cat_id(filename: str, cls_name: str) -> str:
    """Single source of truth for cat_id parsing (used by extract and scripts).

    Returns a per-class synthetic id for generic/garbage tokens so they stay
    mono-class and are excluded from validation folds.
    """
    m = _STRICT_NAME_RE.match(filename)
    if m:
        cat_id = m.group("cat")
    else:
        m2 = _FALLBACK_NAME_RE.match(filename)
        cat_id = m2.group("cat") if m2 else "unknown"
    if "__aug" in cat_id:
        cat_id = cat_id.split("__aug")[0]
    cat_id = _strip_seg_suffix(cat_id)
    if cat_id in GENERIC_TOKENS:
        return f"pandeya_{cls_name}"
    return cat_id


def subsample_majority(y, groups, cap, seed=42):
    """Indices keeping at most `cap` samples per class, preferring cat diversity."""
    if cap is None or cap <= 0:
        return np.arange(len(y))
    rng = np.random.default_rng(seed)
    keep = []
    for cls in np.unique(y):
        idx = np.where(y == cls)[0]
        if len(idx) <= cap:
            keep.extend(idx.tolist())
            continue
        by_cat = {}
        for i in idx:
            by_cat.setdefault(str(groups[i]), []).append(int(i))
        for lst in by_cat.values():
            rng.shuffle(lst)
        cats = list(by_cat.keys())
        rng.shuffle(cats)
        picked = []
        pos = {c: 0 for c in cats}
        while len(picked) < cap:
            progressed = False
            for c in cats:
                if pos[c] < len(by_cat[c]):
                    picked.append(by_cat[c][pos[c]])
                    pos[c] += 1
                    progressed = True
                    if len(picked) >= cap:
                        break
            if not progressed:
                break
        keep.extend(picked)
    return np.array(sorted(keep), dtype=int)


def make_sgkf_folds(X, y, groups, k, seed):
    sgkf = StratifiedGroupKFold(n_splits=k, shuffle=True, random_state=seed)
    return list(sgkf.split(X, y, groups))


def make_anchor_loco_folds(y, groups):
    """LOCO restricted to 'anchor' cats (>=2 classes). Returns (train, val, cat)."""
    classes_per_cat = {}
    for lbl, g in zip(y, groups):
        classes_per_cat.setdefault(str(g), set()).add(int(lbl))
    anchors = sorted(c for c, s in classes_per_cat.items() if len(s) >= 2)
    g_str = groups.astype(str)
    folds = []
    for cat in anchors:
        val_idx = np.where(g_str == cat)[0]
        train_idx = np.where(g_str != cat)[0]
        folds.append((train_idx, val_idx, cat))
    return folds


def pooled_metrics(y_true, y_pred, classes):
    n = len(classes)
    labels = list(range(n))
    macro = float(f1_score(y_true, y_pred, average="macro", labels=labels, zero_division=0))
    weighted = float(f1_score(y_true, y_pred, average="weighted", labels=labels, zero_division=0))
    per_class = f1_score(y_true, y_pred, average=None, labels=labels, zero_division=0)
    report = classification_report(
        y_true, y_pred, labels=labels, target_names=classes, zero_division=0
    )
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    return {
        "macro_f1": macro,
        "weighted_f1": weighted,
        "per_class_f1": {classes[i]: float(per_class[i]) for i in range(n)},
        "report": report,
        "confusion_matrix": cm,
    }


# ---------------------------------------------------------------------------
# Config + IO
# ---------------------------------------------------------------------------

def _check_tf():
    if not TF_AVAILABLE:
        raise ImportError(
            "TensorFlow and tensorflow-hub are required. "
            "Install with: pip install tensorflow tensorflow-hub"
        )


def load_config(config_path: str) -> dict:
    return yaml.safe_load(Path(config_path).read_text())


def load_embeddings(classes, emb_dir):
    all_emb, all_lab, all_cat = [], [], []
    for cls_name in classes:
        npz_path = emb_dir / f"{cls_name}.npz"
        if not npz_path.exists():
            print(f"[WARN] Embeddings not found for class: {cls_name}")
            continue
        data = np.load(npz_path, allow_pickle=True)
        all_emb.append(data["embeddings"])
        all_lab.append(data["labels"])
        cat_raw = data["cat_ids"]
        if cat_raw.ndim == 0:
            cat_raw = cat_raw.item()
        if isinstance(cat_raw, str):
            all_cat.append(cat_raw)
        else:
            all_cat.extend(str(x) for x in cat_raw)
    if not all_emb:
        raise SystemExit("No embeddings found. Run `extract` first.")
    X = np.concatenate(all_emb).astype(np.float32)
    y = np.concatenate(all_lab).astype(int)
    groups = np.array(all_cat, dtype=object)
    return X, y, groups


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------

_DEFAULT_CAT_AUDIOSET_IDX = [67, 68, 74, 76, 77, 78, 79, 80]


def extract_embeddings(config_path: str) -> None:
    _check_tf()
    cfg = load_config(config_path)
    classes = cfg["classes"]
    processed_dir = Path(cfg["audio"].get("processed_dir", "data/processed"))
    output_dir = Path("data/embeddings")
    print(f"[INFO] Reading audio from: {processed_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)

    print("[INFO] Loading YAMNet from TensorFlow Hub...")
    yamnet = hub.load(cfg["yamnet"]["hub_url"])
    print("[INFO] YAMNet loaded.")

    sample_rate = cfg["audio"]["sample_rate"]
    highpass_cutoff = cfg["audio"]["highpass_cutoff"]
    aggregation = cfg["yamnet"].get("aggregation", "mean")

    pros_cfg = cfg.get("prosodic", {}) or {}
    pros_enabled = bool(pros_cfg.get("enabled", False))
    pros_cache: dict[str, np.ndarray] = {}
    if pros_enabled:
        from .prosodic_features import extract_prosodic, PROSODIC_DIM
        cache_path = Path(pros_cfg.get("cache", "data/prosodic_cache.npz"))
        if cache_path.exists():
            cz = np.load(cache_path, allow_pickle=True)
            pros_cache = {str(p): v for p, v in zip(cz["paths"], cz["feats"])}
            print(f"[INFO] Prosodic features ENABLED (+{PROSODIC_DIM} dims), "
                  f"cache hit: {len(pros_cache)} vectors from {cache_path}")
        else:
            print(f"[INFO] Prosodic features ENABLED (+{PROSODIC_DIM} dims), "
                  f"no cache (computing inline — slow)")

    ff_cfg = cfg["yamnet"].get("frame_filter", {}) or {}
    ff_enabled = bool(ff_cfg.get("enabled", False))
    ff_idx = ff_cfg.get("audioset_indices", _DEFAULT_CAT_AUDIOSET_IDX)
    ff_pct = float(ff_cfg.get("percentile", 60))
    ff_floor = float(ff_cfg.get("min_score", 0.05))
    ff_min_frames = int(ff_cfg.get("min_frames", 2))

    from scipy.signal import butter, filtfilt
    import soundfile as sf

    def _highpass(data, cutoff, fs, order=5):
        nyq = 0.5 * fs
        b, a = butter(order, cutoff / nyq, btype="high", analog=False)
        return filtfilt(b, a, data)

    for cls_name in classes:
        cls_dir = processed_dir / cls_name
        if not cls_dir.exists():
            print(f"[WARN] Missing class dir: {cls_dir}")
            continue
        wav_files = sorted(cls_dir.glob("*.wav"))
        if not wav_files:
            print(f"[WARN] No wavs for: {cls_name}")
            continue
        print(f"[INFO] Class '{cls_name}': {len(wav_files)} files")

        emb_l, lab_l, cat_l, path_l = [], [], [], []
        n_filtered = 0
        for wav_path in wav_files:
            try:
                pcm, sr = sf.read(str(wav_path), dtype="float32")
            except Exception as e:
                print(f"  [SKIP] {wav_path.name}: {e}")
                continue
            if pcm.ndim > 1:
                pcm = pcm.mean(axis=1)
            if sr != sample_rate:
                from librosa import resample
                pcm = resample(pcm, orig_sr=sr, target_sr=sample_rate)
            pcm = pcm - np.mean(pcm)
            if len(pcm) > 15:
                pcm = _highpass(pcm, highpass_cutoff, sample_rate, order=5)
            peak = np.max(np.abs(pcm))
            if peak > 1e-6:
                pcm = pcm / peak
            pcm = pcm.astype(np.float32)
            # Prosodic features must see the REAL (un-padded) signal: padding to
            # min_len would corrupt `duration`/RMS (critical for short atencion
            # clips). Capture the pre-pad pcm before YAMNet's min-length padding.
            pcm_pros = pcm
            min_len = int(0.96 * sample_rate)
            if len(pcm) < min_len:
                pad = np.zeros(min_len, dtype=np.float32)
                pad[: len(pcm)] = pcm
                pcm = pad

            scores, embeddings, _ = yamnet(tf.convert_to_tensor(pcm, dtype=tf.float32))
            emb_np = embeddings.numpy()

            if ff_enabled and emb_np.shape[0] >= ff_min_frames:
                sc = scores.numpy()
                idx = [i for i in ff_idx if i < sc.shape[1]]
                if idx:
                    frame_cat = sc[:, idx].max(axis=1)
                    thresh = max(ff_floor, np.percentile(frame_cat, ff_pct))
                    keep = frame_cat >= thresh
                    if keep.sum() >= ff_min_frames:
                        emb_np = emb_np[keep]
                        n_filtered += 1

            if aggregation == "mean":
                pooled = emb_np.mean(axis=0)
            elif aggregation == "max":
                pooled = emb_np.max(axis=0)
            elif aggregation == "mean_std":
                pooled = np.concatenate([emb_np.mean(axis=0), emb_np.std(axis=0)])
            else:
                pooled = emb_np.mean(axis=0)

            if pros_enabled:
                # prosodic features: prefer the precomputed parallel cache,
                # fall back to inline computation for any cache miss.
                pros = pros_cache.get(str(wav_path))
                if pros is None:
                    pros = extract_prosodic(pcm_pros, sample_rate)
                pooled = np.concatenate([pooled, pros])

            cat_id = parse_cat_id(wav_path.name, cls_name)
            emb_l.append(pooled)
            lab_l.append(classes.index(cls_name))
            cat_l.append(cat_id)
            path_l.append(str(wav_path))

        if not emb_l:
            print(f"[WARN] No embeddings for {cls_name}")
            continue
        out_path = output_dir / f"{cls_name}.npz"
        np.savez_compressed(
            out_path,
            embeddings=np.stack(emb_l).astype(np.float32),
            labels=np.array(lab_l, dtype=np.int32),
            cat_ids=np.array(cat_l, dtype=object),
            file_paths=np.array(path_l, dtype=object),
        )
        extra = f", frame-filtered {n_filtered}" if ff_enabled else ""
        print(f"  [OK] {len(emb_l)} embeddings -> {out_path} (agg={aggregation}{extra})")


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def _make_macro_f1_callback():
    class MacroF1EarlyStopping(tf.keras.callbacks.Callback):
        def __init__(self, Xv, yv, n_classes, patience):
            super().__init__()
            self.Xv, self.yv = Xv, yv
            self.labels = list(range(n_classes))
            self.patience = patience
            self.best = -1.0
            self.best_w = None
            self.wait = 0

        def on_epoch_end(self, epoch, logs=None):
            logs = logs or {}
            p = self.model.predict(self.Xv, verbose=0).argmax(axis=1)
            f = float(f1_score(self.yv, p, average="macro", labels=self.labels, zero_division=0))
            logs["val_macro_f1"] = f
            if f > self.best + 1e-4:
                self.best = f
                self.best_w = self.model.get_weights()
                self.wait = 0
            else:
                self.wait += 1
                if self.wait >= self.patience:
                    self.model.stop_training = True

        def on_train_end(self, logs=None):
            if self.best_w is not None:
                self.model.set_weights(self.best_w)

    return MacroF1EarlyStopping


def _build(cfg, input_dim, n_classes):
    return build_yamnet_head(
        input_dim=input_dim,
        num_classes=n_classes,
        hidden_layers=cfg["yamnet"].get("head_hidden_layers", [256, 128]),
        dropout_rates=cfg["yamnet"].get("head_dropout", [0.5, 0.4]),
        l2_reg=cfg["yamnet"].get("head_l2_reg", 1e-4),
        learning_rate=cfg["train"].get("lr", 5e-4),
    )


def _fit_fold(cfg, X_tr, y_tr, X_va, y_va, input_dim, n_classes):
    scaler = StandardScaler().fit(X_tr)
    Xtr = scaler.transform(X_tr).astype(np.float32)
    Xva = scaler.transform(X_va).astype(np.float32)

    present = np.unique(y_tr)
    if len(present) >= 2:
        w = compute_class_weight("balanced", classes=present, y=y_tr)
        cw = {int(c): float(v) for c, v in zip(present, w)}
    else:
        cw = None

    model = _build(cfg, input_dim, n_classes)
    CB = _make_macro_f1_callback()
    cb = CB(Xva, y_va, n_classes, cfg["train"].get("early_stopping_patience", 15))
    rlr = tf.keras.callbacks.ReduceLROnPlateau(
        monitor="val_macro_f1", mode="max",
        factor=cfg["train"].get("lr_decay_factor", 0.5),
        patience=cfg["train"].get("lr_decay_patience", 8),
    )
    model.fit(
        Xtr, y_tr,
        validation_data=(Xva, y_va),
        epochs=cfg["train"].get("epochs", 100),
        batch_size=cfg["train"].get("batch_size", 64),
        class_weight=cw,
        callbacks=[cb, rlr],
        verbose=0,
    )
    return model.predict(Xva, verbose=0)  # full probability matrix (n_val, n_classes)


def train(config_path: str, cv_folds: int | None = None, protocol: str = "sgkf") -> None:
    _check_tf()
    cfg = load_config(config_path)
    classes = cfg["classes"]
    n_classes = len(classes)
    aggregation = cfg["yamnet"].get("aggregation", "mean")

    X, y, groups = load_embeddings(classes, Path("data/embeddings"))
    # Infer input_dim from the data so prosodic features (or any change in the
    # aggregation) are picked up automatically instead of hard-coding the size.
    input_dim = int(X.shape[1])
    expected = EMBEDDING_DIM * 2 if aggregation == "mean_std" else EMBEDDING_DIM
    if input_dim != expected:
        print(f"[INFO] input_dim={input_dim} (base {expected} + {input_dim - expected} extra, "
              f"e.g. prosodic features)")
    seed = cfg["train"].get("seed", 42)
    np.random.seed(seed)
    tf.random.set_seed(seed)

    cap = cfg["train"].get("majority_cap")
    if cap:
        before = len(X)
        keep = subsample_majority(y, groups, int(cap), seed)
        X, y, groups = X[keep], y[keep], groups[keep]
        print(f"[INFO] majority_cap={cap}: {before} -> {len(X)} samples")

    print(f"[INFO] Samples={len(X)}  classes={n_classes}  input_dim={input_dim}  "
          f"unique_cats={len(set(groups))}")

    if protocol == "loco":
        folds_full = make_anchor_loco_folds(y, groups)
        folds = [(tr, va) for tr, va, _cat in folds_full]
        print(f"[INFO] Anchor-LOCO: {len(folds)} folds (cats with >=2 classes)")
    else:
        k = cv_folds or cfg["train"].get("cv_folds", 5)
        folds = make_sgkf_folds(X, y, groups, k, seed)
        print(f"[INFO] StratifiedGroupKFold: {len(folds)} folds")

    oof_true, oof_proba = [], []
    for i, (tr, va) in enumerate(folds):
        if len(np.unique(y[va])) < 1:
            continue
        proba = _fit_fold(cfg, X[tr], y[tr], X[va], y[va], input_dim, n_classes)
        yp = proba.argmax(axis=1)
        oof_true.append(y[va])
        oof_proba.append(proba)
        fold_f1 = f1_score(y[va], yp, average="macro", labels=list(range(n_classes)), zero_division=0)
        print(f"[fold {i}] n_val={len(va)} classes_in_val={len(np.unique(y[va]))} "
              f"fold_macro_f1={fold_f1:.3f}")

    y_true = np.concatenate(oof_true)
    proba_all = np.concatenate(oof_proba)
    y_pred = proba_all.argmax(axis=1)
    m = pooled_metrics(y_true, y_pred, classes)

    # Persist OOF probabilities for honest threshold calibration (Phase 1).
    Path("artifacts").mkdir(exist_ok=True)
    np.savez_compressed("artifacts/oof_predictions.npz",
                        y_true=y_true, proba=proba_all.astype(np.float32))

    print("\n========== POOLED OUT-OF-FOLD METRICS ==========")
    print(m["report"])
    print(f"[RESULT] OOF macro-F1 (global) : {m['macro_f1']:.3f}")
    print(f"[RESULT] OOF weighted-F1        : {m['weighted_f1']:.3f}")

    print("\n[INFO] Training FINAL model on ALL data...")
    scaler_all = StandardScaler().fit(X)
    Xs = scaler_all.transform(X).astype(np.float32)
    tr0, va0 = make_sgkf_folds(Xs, y, groups, cfg["train"].get("cv_folds", 5), seed)[0]
    present = np.unique(y[tr0])
    w = compute_class_weight("balanced", classes=present, y=y[tr0])
    cw = {int(c): float(v) for c, v in zip(present, w)}
    final = _build(cfg, input_dim, n_classes)
    CB = _make_macro_f1_callback()
    cb = CB(Xs[va0], y[va0], n_classes, cfg["train"].get("early_stopping_patience", 15))
    final.fit(
        Xs[tr0], y[tr0],
        validation_data=(Xs[va0], y[va0]),
        epochs=cfg["train"].get("epochs", 100),
        batch_size=cfg["train"].get("batch_size", 64),
        class_weight=cw,
        callbacks=[cb],
        verbose=0,
    )

    Path("artifacts").mkdir(exist_ok=True)
    final.save("artifacts/best_head_model.keras")
    np.savez(
        "artifacts/feature_scaler.npz",
        mean=scaler_all.mean_.astype(np.float32),
        scale=scaler_all.scale_.astype(np.float32),
    )
    np.save("artifacts/confusion_matrix.npy", m["confusion_matrix"])
    with open("artifacts/training_config.json", "w") as f:
        json.dump(
            {
                "classes": classes,
                "input_dim": input_dim,
                "aggregation": aggregation,
                "protocol": protocol,
                "n_folds": len(folds),
                "oof_macro_f1": m["macro_f1"],
                "oof_weighted_f1": m["weighted_f1"],
                "per_class_f1": m["per_class_f1"],
                "majority_cap": cap,
                "scaler": "artifacts/feature_scaler.npz",
            },
            f,
            indent=2,
        )
    print("[OK] Final model -> artifacts/best_head_model.keras")
    print("[OK] Scaler      -> artifacts/feature_scaler.npz")


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

def evaluate(config_path: str) -> None:
    _check_tf()
    cfg = load_config(config_path)
    classes = cfg["classes"]
    X, y, _ = load_embeddings(classes, Path("data/embeddings"))

    scaler_path = Path("artifacts/feature_scaler.npz")
    if scaler_path.exists():
        s = np.load(scaler_path)
        X = ((X - s["mean"]) / s["scale"]).astype(np.float32)
    else:
        print("[WARN] No scaler found; evaluating on raw embeddings.")

    model = tf.keras.models.load_model("artifacts/best_head_model.keras")
    y_pred = model.predict(X).argmax(axis=1)
    m = pooled_metrics(y, y_pred, classes)
    print(m["report"])
    print(f"\n[RESULT] (train-set) macro-F1: {m['macro_f1']:.3f}  "
          f"(NOTE: optimistic; trust the OOF macro-F1 from `train`).")

    Path("artifacts/evaluation").mkdir(parents=True, exist_ok=True)
    Path("artifacts/evaluation/classification_report.txt").write_text(m["report"])


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="YAMNet Transfer Learning Pipeline")
    sub = ap.add_subparsers(dest="command")

    ep = sub.add_parser("extract")
    ep.add_argument("--config", default="config.yaml")

    tp = sub.add_parser("train")
    tp.add_argument("--config", default="config.yaml")
    tp.add_argument("--cv-folds", type=int, default=None)
    tp.add_argument("--protocol", choices=["sgkf", "loco"], default="sgkf")

    vp = sub.add_parser("evaluate")
    vp.add_argument("--config", default="config.yaml")

    args = ap.parse_args()
    if args.command == "extract":
        extract_embeddings(args.config)
    elif args.command == "train":
        train(args.config, cv_folds=args.cv_folds, protocol=args.protocol)
    elif args.command == "evaluate":
        evaluate(args.config)
    else:
        ap.print_help()
