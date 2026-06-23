"""Convert Freesound previews (MP3) into the processed 16 kHz mono WAV layout.

Freesound previews are typically 16-bit 44.1 kHz stereo MP3. We:
  1. Decode with librosa
  2. Resample to 16 kHz mono
  3. High-pass 100 Hz Butterworth order 5
  4. Peak-normalize
  5. Save to data/processed/<class>/<cat_id>__<uuid>.wav

Each Freesound sound becomes its own cat_id (`fs_<id>`) so that the model
never sees the same sound across train/val. We sample 0.5 s at a random
offset from clips longer than 2 s to maximize speaker diversity per
sample (sounds often contain pauses).
"""

from __future__ import annotations

import argparse
import re
import sys
import uuid
from pathlib import Path

import numpy as np
import soundfile as sf

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from scipy.signal import butter, filtfilt

TARGET_SR = 16000
HIGHPASS_CUTOFF = 100.0
HIGHPASS_ORDER = 5
MIN_DURATION_S = 0.96
MAX_DURATION_S = 6.0
RNG = np.random.default_rng(2026)


def _highpass(data: np.ndarray, cutoff: float, fs: int, order: int = 5) -> np.ndarray:
    if len(data) <= 3 * order:
        return data
    nyq = 0.5 * fs
    b, a = butter(order, cutoff / nyq, btype="high", analog=False)
    return filtfilt(b, a, data)


def _trim_or_pad(pcm: np.ndarray, target_samples: int) -> np.ndarray:
    if len(pcm) >= target_samples:
        # For long clips, pick a random window
        if len(pcm) > target_samples * 1.5:
            start = RNG.integers(0, len(pcm) - target_samples)
        else:
            start = 0
        return pcm[start : start + target_samples]
    pad = np.zeros(target_samples, dtype=pcm.dtype)
    pad[: len(pcm)] = pcm
    return pad


def _load_and_process(mp3_path: Path) -> np.ndarray | None:
    try:
        pcm, sr = sf.read(str(mp3_path), dtype="float32")
    except Exception as e:
        print(f"  [SKIP] {mp3_path.name}: cannot decode ({e})")
        return None

    if pcm.ndim > 1:
        pcm = pcm.mean(axis=1)

    if sr != TARGET_SR:
        try:
            from librosa import resample
            pcm = resample(pcm, orig_sr=sr, target_sr=TARGET_SR)
        except Exception as e:
            print(f"  [SKIP] {mp3_path.name}: resample failed ({e})")
            return None

    pcm = pcm - np.mean(pcm)
    pcm = _highpass(pcm, HIGHPASS_CUTOFF, TARGET_SR, HIGHPASS_ORDER)

    peak = float(np.max(np.abs(pcm)))
    if peak > 1e-6:
        pcm = pcm / peak
    return pcm.astype(np.float32)


def _split_long_clip(pcm: np.ndarray, max_samples: int) -> list[np.ndarray]:
    """Split clips longer than max_samples into multiple windows.

    Returns 1-3 clips depending on length. Each clip still receives a
    unique cat_id (same root, different segment suffix).
    """
    if len(pcm) <= max_samples * 1.5:
        return [pcm]
    n_segments = min(3, max(1, len(pcm) // max_samples))
    out = []
    for i in range(n_segments):
        start = i * (len(pcm) - max_samples) // max(1, n_segments - 1) if n_segments > 1 else 0
        end = min(start + max_samples, len(pcm))
        out.append(pcm[start:end])
    return out


def _cat_id_from_filename(name: str) -> str:
    m = re.match(r"fs_(\d+)_", name)
    if m:
        return f"fs_{m.group(1)}"
    return re.sub(r"[^A-Za-z0-9_-]", "_", Path(name).stem)[:32] or "freesound"


def main() -> None:
    ap = argparse.ArgumentParser(description="Process Freesound previews into processed WAV layout")
    ap.add_argument("--raw", required=True, type=Path, help="data/raw/freesound")
    ap.add_argument("--out", default=Path("data/processed"), type=Path)
    ap.add_argument("--max-segments-per-clip", type=int, default=2, help="Max segments extracted from long clips")
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    global RNG
    RNG = np.random.default_rng(args.seed)

    max_samples = int(MAX_DURATION_S * TARGET_SR)
    min_samples = int(MIN_DURATION_S * TARGET_SR)

    total_written = 0
    for cls_dir in sorted(args.raw.iterdir()):
        if not cls_dir.is_dir():
            continue
        cls_name = cls_dir.name
        dst = args.out / cls_name
        if not args.dry_run:
            dst.mkdir(parents=True, exist_ok=True)

        written = 0
        for mp3 in sorted(cls_dir.glob("*.mp3")):
            cat_id = _cat_id_from_filename(mp3.name)
            pcm = _load_and_process(mp3)
            if pcm is None or len(pcm) < min_samples // 2:
                continue
            segments = _split_long_clip(pcm, max_samples)[: args.max_segments_per_clip]
            for seg_idx, seg in enumerate(segments):
                seg = _trim_or_pad(seg, max_samples)
                if args.dry_run:
                    written += 1
                    continue
                suffix = "" if len(segments) == 1 else f"_seg{seg_idx}"
                out_name = f"{cat_id}{suffix}__{uuid.uuid4().hex[:8]}.wav"
                sf.write(str(dst / out_name), seg, TARGET_SR)
                written += 1

        total_written += written
        print(f"  [{cls_name}] {written} samples -> {dst}")

    print(f"\n[OK] Wrote {total_written} samples to {args.out}")


if __name__ == "__main__":
    main()
