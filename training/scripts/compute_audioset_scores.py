"""One YAMNet pass that caches per-clip AudioSet (521-class) mean scores.

YAMNet is an AudioSet classifier: besides the 1024-d embedding it outputs a
521-class probability per frame (Speech, Conversation, Music, Cat, Meow, Purr,
Hiss, ...). Averaging those over the clip tells us WHAT YAMNet thinks the clip
actually is. We use this as an objective oracle to detect clips that are human
speech / music wrongly labeled as a cat sound (the VGGSound weak-label problem).

Writes data/audioset_scores.npz with:
  file_names (basename), labels, scores (N, 521)
and data/audioset_class_map.json with the 521 display names (for the filter).

This is a ~20-40 min CPU pass (same cost as `extract`), run ONCE; the filter
script then iterates instantly on the cached scores.

Usage:
  python -m... no, run as a script:
  python scripts/compute_audioset_scores.py --config config.yaml
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np
import yaml
import soundfile as sf
import tensorflow_hub as hub
import tensorflow as tf
from scipy.signal import butter, filtfilt


def _highpass(data, cutoff, fs, order=5):
    nyq = 0.5 * fs
    b, a = butter(order, cutoff / nyq, btype="high", analog=False)
    return filtfilt(b, a, data)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="config.yaml")
    ap.add_argument("--out", default="data/audioset_scores.npz")
    args = ap.parse_args()

    cfg = yaml.safe_load(Path(args.config).read_text())
    classes = cfg["classes"]
    sr = cfg["audio"]["sample_rate"]
    hp = cfg["audio"]["highpass_cutoff"]
    # Always read the ORIGINAL processed dir (we want scores for the real data).
    processed = Path("data/processed")

    print("[INFO] Loading YAMNet...")
    yamnet = hub.load(cfg["yamnet"]["hub_url"])
    # class map (521 names)
    rows = list(csv.DictReader(open(yamnet.class_map_path().numpy())))
    names = [r["display_name"] for r in rows]
    Path("data/audioset_class_map.json").write_text(json.dumps(names, ensure_ascii=False, indent=0))
    print(f"[INFO] {len(names)} AudioSet classes")

    all_names, all_labels, all_scores = [], [], []
    for ci, c in enumerate(classes):
        d = processed / c
        wavs = sorted(d.glob("*.wav"))
        print(f"[INFO] {c}: {len(wavs)} files")
        for w in wavs:
            try:
                pcm, s = sf.read(str(w), dtype="float32")
            except Exception as e:
                print(f"  [SKIP] {w.name}: {e}")
                continue
            if pcm.ndim > 1:
                pcm = pcm.mean(axis=1)
            if s != sr:
                from librosa import resample
                pcm = resample(pcm, orig_sr=s, target_sr=sr)
            pcm = pcm - np.mean(pcm)
            if len(pcm) > 15:
                pcm = _highpass(pcm, hp, sr, order=5)
            peak = np.max(np.abs(pcm))
            if peak > 1e-6:
                pcm = pcm / peak
            pcm = pcm.astype(np.float32)
            min_len = int(0.96 * sr)
            if len(pcm) < min_len:
                pad = np.zeros(min_len, dtype=np.float32)
                pad[: len(pcm)] = pcm
                pcm = pad
            scores, _, _ = yamnet(tf.convert_to_tensor(pcm, dtype=tf.float32))
            all_names.append(w.name)
            all_labels.append(ci)
            all_scores.append(scores.numpy().mean(axis=0).astype(np.float32))

    np.savez_compressed(
        args.out,
        file_names=np.array(all_names, dtype=object),
        labels=np.array(all_labels, dtype=np.int32),
        scores=np.stack(all_scores).astype(np.float32),
    )
    print(f"[DONE] {len(all_names)} clips -> {args.out}")


if __name__ == "__main__":
    main()
