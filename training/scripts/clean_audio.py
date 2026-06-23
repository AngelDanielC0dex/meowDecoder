"""Silence trimming + energy gating for the processed dataset.

There is no VAD/silence removal anywhere else in the pipeline, so long
Freesound/VGGSound clips are mostly background that dilutes the YAMNet
mean_std embedding. This script trims leading/trailing silence and discards
clips that have almost no voiced energy after trimming.

Non-destructive by default: writes cleaned wavs to --output, preserving the
exact filename (so cat_id parsing is unaffected). Run `extract` afterwards on
the cleaned directory.

Usage:
  python scripts/clean_audio.py --input data/processed --output data/processed_clean
  python scripts/clean_audio.py --input data/processed --output data/processed_clean --top-db 30 --min-voiced-s 0.3
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import soundfile as sf

try:
    import librosa
except ImportError as e:  # pragma: no cover
    raise SystemExit("librosa is required: pip install librosa") from e

SAMPLE_RATE = 16000


def trim_and_gate(pcm: np.ndarray, sr: int, top_db: float, min_voiced_s: float):
    """Return cleaned pcm or None if the clip is essentially empty."""
    if pcm.ndim > 1:
        pcm = pcm.mean(axis=1)
    pcm = pcm.astype(np.float32)
    if len(pcm) < int(0.05 * sr):
        return None
    trimmed, _ = librosa.effects.trim(pcm, top_db=top_db)
    if len(trimmed) < int(0.1 * sr):
        trimmed = pcm  # trim removed everything: keep original, gate decides
    rms = librosa.feature.rms(y=trimmed, frame_length=1024, hop_length=512)[0]
    if rms.size == 0 or rms.max() <= 1e-6:
        return None
    voiced_frames = int((rms > rms.max() * 0.1).sum())
    voiced_s = voiced_frames * 512 / sr
    if voiced_s < min_voiced_s:
        return None
    return trimmed


def main() -> None:
    ap = argparse.ArgumentParser(description="Trim silence and gate empty clips")
    ap.add_argument("--input", required=True, type=Path)
    ap.add_argument("--output", required=True, type=Path)
    ap.add_argument("--top-db", type=float, default=30.0)
    ap.add_argument("--min-voiced-s", type=float, default=0.3)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    classes = [d for d in sorted(args.input.iterdir()) if d.is_dir()]
    total_in = total_out = total_dropped = 0
    for cls_dir in classes:
        out_dir = args.output / cls_dir.name
        if not args.dry_run:
            out_dir.mkdir(parents=True, exist_ok=True)
        kept = dropped = 0
        for wav in sorted(cls_dir.glob("*.wav")):
            total_in += 1
            try:
                pcm, sr = sf.read(str(wav), dtype="float32")
            except Exception as e:
                print(f"  [SKIP] {wav.name}: {e}")
                dropped += 1
                continue
            if sr != SAMPLE_RATE:
                pcm = librosa.resample(
                    pcm if pcm.ndim == 1 else pcm.mean(axis=1),
                    orig_sr=sr, target_sr=SAMPLE_RATE,
                )
                sr = SAMPLE_RATE
            cleaned = trim_and_gate(pcm, sr, args.top_db, args.min_voiced_s)
            if cleaned is None:
                dropped += 1
                continue
            kept += 1
            if not args.dry_run:
                sf.write(str(out_dir / wav.name), cleaned, SAMPLE_RATE)
        total_out += kept
        total_dropped += dropped
        print(f"[{cls_dir.name:22s}] kept={kept:5d} dropped={dropped:4d}")
    print(f"\n[SUMMARY] in={total_in} kept={total_out} dropped={total_dropped} "
          f"({100*total_dropped/max(1,total_in):.1f}% removed)")
    if args.dry_run:
        print("[DRY-RUN] no files written")


if __name__ == "__main__":
    main()
