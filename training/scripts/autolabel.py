"""
Auto-classifier for UNLABELED cat clips, to save manual triage.

Takes a folder of clips that all sit under one (provisional) class — e.g. the
DvC dump in data/quarantine/atencion/dvc_*.wav — featurizes each EXACTLY like the
training `extract` step (YAMNet mean+std + prosodic → 2073-dim), runs the trained
head model, and MOVES each clip into data/quarantine/<predicted_class>/ so you
only have to *review* the suggestions instead of labeling from scratch.

It is a first pass: the model is OUR classifier (so it inherits its biases on the
hard meow-family), and YouTube clips are out-of-distribution, so ALWAYS skim the
result. A confidence is written to autolabel_report.csv; low-confidence clips
(below --min-conf) go to data/quarantine/_review/ for closer listening.

Does NOT touch the training pipeline or processed_clean. Run AFTER you have a
trained model (artifacts/best_head_model.keras + feature_scaler.npz).

Usage:
  python scripts/autolabel.py --src data/quarantine/atencion --glob "dvc_*.wav"
  python scripts/autolabel.py --src data/quarantine/atencion --glob "dvc_*.wav" --min-conf 0.5 --dry-run
"""

from __future__ import annotations

import argparse
import csv
import shutil
import sys
from pathlib import Path

import numpy as np

try:
    import soundfile as sf
    from scipy.signal import butter, filtfilt
    import tensorflow as tf
    import tensorflow_hub as hub
    from meowdecoder_training.yamnet_pipeline import load_config, _DEFAULT_CAT_AUDIOSET_IDX
    from meowdecoder_training.prosodic_features import extract_prosodic
except Exception as e:  # pragma: no cover
    raise SystemExit(f"Missing deps / package not importable: {e}")

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def _highpass(data, cutoff, fs, order=5):
    nyq = 0.5 * fs
    b, a = butter(order, cutoff / nyq, btype="high", analog=False)
    return filtfilt(b, a, data)


def featurize(yamnet, wav_path, cfg) -> np.ndarray | None:
    """Replicates yamnet_pipeline.extract_embeddings EXACTLY (so the model sees
    the same 2073-dim space it was trained on)."""
    sample_rate = cfg["audio"]["sample_rate"]
    highpass_cutoff = cfg["audio"]["highpass_cutoff"]
    aggregation = cfg["yamnet"].get("aggregation", "mean")
    ff = cfg["yamnet"].get("frame_filter", {}) or {}
    ff_on = bool(ff.get("enabled", False))
    ff_idx = ff.get("audioset_indices", _DEFAULT_CAT_AUDIOSET_IDX)
    ff_pct = float(ff.get("percentile", 60))
    ff_floor = float(ff.get("min_score", 0.05))
    ff_min = int(ff.get("min_frames", 2))
    pros_on = bool((cfg.get("prosodic", {}) or {}).get("enabled", False))

    try:
        pcm, sr = sf.read(str(wav_path), dtype="float32")
    except Exception:
        return None
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
    pcm_pros = pcm
    min_len = int(0.96 * sample_rate)
    if len(pcm) < min_len:
        pad = np.zeros(min_len, dtype=np.float32)
        pad[: len(pcm)] = pcm
        pcm = pad

    _, embeddings, _ = yamnet(tf.convert_to_tensor(pcm, dtype=tf.float32))
    emb_np = embeddings.numpy()
    if ff_on and emb_np.shape[0] >= ff_min:
        scores, _, _ = yamnet(tf.convert_to_tensor(pcm, dtype=tf.float32))
        sc = scores.numpy()
        idx = [i for i in ff_idx if i < sc.shape[1]]
        if idx:
            frame_cat = sc[:, idx].max(axis=1)
            thresh = max(ff_floor, np.percentile(frame_cat, ff_pct))
            keep = frame_cat >= thresh
            if keep.sum() >= ff_min:
                emb_np = emb_np[keep]

    if aggregation == "mean_std":
        pooled = np.concatenate([emb_np.mean(axis=0), emb_np.std(axis=0)])
    elif aggregation == "max":
        pooled = emb_np.max(axis=0)
    else:
        pooled = emb_np.mean(axis=0)
    if pros_on:
        pooled = np.concatenate([pooled, extract_prosodic(pcm_pros, sample_rate)])
    return pooled.astype(np.float32)


def main() -> None:
    ap = argparse.ArgumentParser(description="Auto-classify unlabeled clips with the trained model")
    ap.add_argument("--src", required=True, help="Folder with the clips to classify")
    ap.add_argument("--glob", default="*.wav", help="Filename pattern (e.g. dvc_*.wav)")
    ap.add_argument("--out", default="data/quarantine", help="Distribute into <out>/<class>/")
    ap.add_argument("--config", default="config.yaml")
    ap.add_argument("--min-conf", type=float, default=0.0,
                    help="Below this softmax prob → send to <out>/_review/ instead")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    cfg = load_config(args.config)
    classes = cfg["classes"]
    src = Path(args.src)
    clips = sorted(src.glob(args.glob))
    if not clips:
        print(f"[INFO] no clips matching '{args.glob}' under {src}")
        return

    model_path = Path("artifacts/best_head_model.keras")
    scaler_path = Path("artifacts/feature_scaler.npz")
    if not model_path.exists() or not scaler_path.exists():
        raise SystemExit("[ERROR] Train first: artifacts/best_head_model.keras + feature_scaler.npz needed.")

    print("[INFO] Loading YAMNet + trained head...")
    yamnet = hub.load(cfg["yamnet"]["hub_url"])
    model = tf.keras.models.load_model(str(model_path))
    s = np.load(scaler_path)
    mean, scale = s["mean"], s["scale"]

    out = Path(args.out)
    report = []
    counts: dict[str, int] = {}
    for i, clip in enumerate(clips, 1):
        feat = featurize(yamnet, clip, cfg)
        if feat is None or feat.shape[0] != mean.shape[0]:
            print(f"  [SKIP] {clip.name} (featurize failed / dim mismatch)")
            continue
        probs = model.predict(((feat - mean) / scale)[None, :], verbose=0)[0]
        k = int(probs.argmax())
        pred, conf = classes[k], float(probs[k])
        dest_cls = pred if conf >= args.min_conf else "_review"
        counts[dest_cls] = counts.get(dest_cls, 0) + 1
        report.append((clip.name, pred, f"{conf:.3f}", dest_cls))
        if not args.dry_run:
            dest = out / dest_cls
            dest.mkdir(parents=True, exist_ok=True)
            if (dest / clip.name).resolve() != clip.resolve():
                shutil.move(str(clip), str(dest / clip.name))
        if i % 50 == 0:
            print(f"  {i}/{len(clips)} classified")

    if not args.dry_run:
        with open("autolabel_report.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["file", "predicted", "confidence", "moved_to"])
            w.writerows(report)

    print("\n" + "=" * 60)
    print("AUTOLABEL" + (" (DRY-RUN)" if args.dry_run else "") + " COMPLETE")
    for cls in sorted(counts):
        print(f"  {cls:22s} {counts[cls]}")
    if not args.dry_run:
        print("\nReport -> autolabel_report.csv")
    print("NEXT: review each data/quarantine/<class>/ folder by ear, fix mistakes,")
    print("      then: python scripts/dedup_against_existing.py --prefix dvc_ --move")
    print("=" * 60)


if __name__ == "__main__":
    main()
