"""
Final deep audio QC — signal-level + optional YAMNet sweep.

Scans ALL sources regardless of origin (curated Pandeya, Freesound, YouTube).
No curated/internet distinction — everything treated equally for the last pass.

Signal checks (always, fast — ~0.01 s/file):
  too_short      trimmed duration < 0.5 s (silence-stripped)
  clipped        > 5 % of samples at |x| > 0.97 (saturated recording)
  low_energy     peak-normalised RMS < -50 dBFS (inaudible)
  mostly_silent  > 70 % of 25 ms frames below -40 dBFS

YAMNet checks (add --yamnet, ~0.5 s/file):
  speech         mean speech score >= 0.05
  music          max  music  score >= 0.15
  no_cat         max cat score < 0.03 AND top-1 not animal

Flagged files -> data/suspicious/final/<class>/
Report        -> data/suspicious/final/QC_FINAL_REPORT.txt

Usage:
  python scripts/qc_final.py                    # dry-run, signal only (fast)
  python scripts/qc_final.py --move             # move flagged (signal only)
  python scripts/qc_final.py --move --yamnet    # signal + YAMNet, move all
  python scripts/qc_final.py --dirs data/processed_clean   # only one dir
"""

from __future__ import annotations

import argparse
import csv
import math
import shutil
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# ── THRESHOLDS ────────────────────────────────────────────────────────────────

CLIP_AMP_THR      = 0.97   # |sample| above this = clipped
CLIP_RATIO_THR    = 0.05   # > 5 % samples clipped → flag
LOW_ENERGY_DB     = -50.0  # peak-normalised RMS threshold (dBFS)
TRIM_SHORT_S      = 0.50   # minimum trimmed duration (seconds)
SILENCE_RMS_THR   = 0.01   # frame RMS below this → "silent frame" (~-40 dBFS)
SILENCE_RATIO_THR = 0.70   # > 70 % of frames silent → flag

# YAMNet (optional)
SPEECH_MEAN_THR = 0.05
MUSIC_MAX_THR   = 0.15
CAT_MAX_THR     = 0.03

CAT_KW    = ["meow", "purr", "hiss", "caterwaul", "growl", "cat"]
CAT_EXCL  = ["cattle", "mastic", "pizzic", "communicat", "locat", "indicat"]
SPEECH_KW = ["speech", "conversation", "narration", "babbl", "singing", "choir",
             "shout", "yell", "whoop", "laughter", "giggle", "humming",
             "whistling", "chant", "wail", "groan", "sigh",
             "male speech", "female speech", "child speech", "monologue"]
MUSIC_KW  = ["music", "guitar", "piano", "drum", "violin", "trumpet",
             "flute", "accordion", "organ", "synthesizer", "orchestra", "harmonica"]
ANIMAL_KW = ["animal", "pets", "livestock", "bird", "dog", "rodent", "fowl"]

SR = 16000
DEFAULT_DIRS = ["data/processed_clean", "data/quarantine", "data/suspicious"]
OUT_DIR      = "data/suspicious/final"


# ── AUDIO LOAD ────────────────────────────────────────────────────────────────

def load_wav(path: Path) -> np.ndarray | None:
    try:
        pcm, sr_file = sf.read(str(path), dtype="float32")
    except Exception as e:
        print(f"  [ERR] {path.name}: {e}")
        return None
    if pcm.ndim > 1:
        pcm = pcm.mean(axis=1)
    if sr_file != SR:
        try:
            import librosa
            pcm = librosa.resample(pcm, orig_sr=sr_file, target_sr=SR)
        except Exception as e2:
            print(f"  [ERR] {path.name}: resample failed: {e2}")
            return None
    return pcm.astype(np.float32)


# ── SIGNAL-LEVEL CHECKS ───────────────────────────────────────────────────────

def _trim_dur(pcm: np.ndarray) -> float:
    """Duration between first and last sample above 0.01 amplitude."""
    above = np.where(np.abs(pcm) > 0.01)[0]
    if len(above) == 0:
        return 0.0
    return float(above[-1] - above[0] + 1) / SR


def signal_checks(pcm: np.ndarray) -> list[str]:
    reasons: list[str] = []

    # 1. Clipping
    clip = float(np.mean(np.abs(pcm) > CLIP_AMP_THR))
    if clip > CLIP_RATIO_THR:
        reasons.append(f"clipped ({clip*100:.1f}% samples > {CLIP_AMP_THR})")

    # 2. Duration after silence trim
    tdur = _trim_dur(pcm)
    if tdur < TRIM_SHORT_S:
        reasons.append(f"too_short ({tdur:.2f} s after trim)")

    # 3. Peak-normalised RMS energy
    peak = float(np.abs(pcm).max())
    if peak > 1e-6:
        normed = pcm / peak
    else:
        normed = pcm
    rms = float(np.sqrt(np.mean(normed**2) + 1e-12))
    rms_db = 20.0 * math.log10(rms)
    if rms_db < LOW_ENERGY_DB:
        reasons.append(f"low_energy ({rms_db:.1f} dBFS)")

    # 4. Silence ratio via 25 ms frames
    hop = max(1, int(0.025 * SR))
    n_frames = len(pcm) // hop
    if n_frames >= 4:
        frame_rms = np.array([
            float(np.sqrt(np.mean(pcm[i * hop: min((i + 1) * hop, len(pcm))] ** 2)))
            for i in range(n_frames)
        ])
        sil = float(np.mean(frame_rms < SILENCE_RMS_THR))
        if sil > SILENCE_RATIO_THR:
            reasons.append(f"mostly_silent ({sil*100:.0f}% of frames)")

    return reasons


# ── YAMNET CHECKS ─────────────────────────────────────────────────────────────

def _build_idx(names: list[str]):
    def match(kws, excl=()):
        return [i for i, n in enumerate(names)
                if any(k in n.lower() for k in kws)
                and not any(e in n.lower() for e in excl)]
    return (match(CAT_KW, CAT_EXCL), match(SPEECH_KW),
            match(MUSIC_KW), match(ANIMAL_KW))


def yamnet_checks(yamnet, pcm: np.ndarray, names: list[str],
                  cat_i, speech_i, music_i, animal_i) -> list[str]:
    import tensorflow as tf
    scores, _, _ = yamnet(tf.convert_to_tensor(pcm, dtype=tf.float32))
    s = scores.numpy().mean(axis=0)

    cat_max      = float(s[cat_i].max())    if cat_i    else 0.0
    speech_mean  = float(s[speech_i].mean()) if speech_i else 0.0
    music_max    = float(s[music_i].max())   if music_i  else 0.0
    top1         = int(s.argmax())
    animalish    = set(cat_i) | set(animal_i)

    reasons: list[str] = []
    if speech_mean >= SPEECH_MEAN_THR:
        reasons.append(f"speech ({speech_mean:.3f} mean)")
    if music_max >= MUSIC_MAX_THR:
        reasons.append(f"music ({music_max:.3f} max)")
    if cat_max < CAT_MAX_THR and top1 not in animalish:
        reasons.append(f"no_cat (cat_max={cat_max:.3f}, top1={names[top1]})")
    return reasons


# ── MAIN ──────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description="Final deep audio QC sweep")
    ap.add_argument("--dirs", nargs="*", default=DEFAULT_DIRS,
                    help=f"Directories to scan (default: {DEFAULT_DIRS})")
    ap.add_argument("--out", default=OUT_DIR,
                    help="Output directory for flagged files")
    ap.add_argument("--move", action="store_true",
                    help="Actually move flagged files (default: dry-run)")
    ap.add_argument("--yamnet", action="store_true",
                    help="Also run YAMNet speech/music/no-cat checks (~0.5 s/file)")
    ap.add_argument("--yamnet-url", default="https://tfhub.dev/google/yamnet/1")
    args = ap.parse_args()

    out_dir = Path(args.out)

    # Load YAMNet if requested
    yamnet = names = cat_i = speech_i = music_i = animal_i = None
    if args.yamnet:
        import os
        os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
        os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
        import tensorflow_hub as hub
        print("[INFO] Loading YAMNet (cached)...")
        yamnet = hub.load(args.yamnet_url)
        names_raw = list(csv.DictReader(open(yamnet.class_map_path().numpy())))
        names = [r["display_name"] for r in names_raw]
        cat_i, speech_i, music_i, animal_i = _build_idx(names)
        print(f"[INFO] cat={len(cat_i)} speech={len(speech_i)} music={len(music_i)}\n")

    total = flagged = moved = 0
    report_lines: list[str] = []

    for root_s in args.dirs:
        root = Path(root_s)
        if not root.exists():
            print(f"[SKIP] {root} not found")
            continue

        # Collect WAVs; skip suspicious/final to avoid re-scanning already-flagged
        wavs = [w for w in sorted(root.rglob("*.wav"))
                if "final" not in w.parts]
        if not wavs:
            print(f"[SKIP] no WAVs in {root}")
            continue

        print(f"\n{'='*60}")
        print(f"Scanning: {root}  ({len(wavs)} files)")
        print(f"{'='*60}")

        for wav in wavs:
            cls = wav.parent.name
            pcm = load_wav(wav)
            if pcm is None:
                continue
            total += 1

            reasons = signal_checks(pcm)
            if args.yamnet:
                reasons += yamnet_checks(yamnet, pcm, names,
                                         cat_i, speech_i, music_i, animal_i)

            if not reasons:
                continue

            flagged += 1
            source_root = root.name
            line = (f"[FLAG] {source_root}/{cls}/{wav.name}\n"
                    f"       {' | '.join(reasons)}")
            print(f"\n{line}")
            report_lines.append(line)

            if args.move:
                dst = out_dir / cls
                dst.mkdir(parents=True, exist_ok=True)
                shutil.move(str(wav), str(dst / wav.name))
                moved += 1
                print(f"       -> moved")

    print(f"\n{'='*60}")
    print(f"DONE  scanned={total}  flagged={flagged}  moved={moved}")
    if not args.move:
        print("DRY-RUN: add --move to actually move files.")
    print(f"{'='*60}")

    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = out_dir / "QC_FINAL_REPORT.txt"
    with open(report_path, "w", encoding="utf-8") as f:
        checks = (f"clip>{CLIP_RATIO_THR*100:.0f}% "
                  f"energy<{LOW_ENERGY_DB}dBFS "
                  f"trim<{TRIM_SHORT_S}s "
                  f"sil>{SILENCE_RATIO_THR*100:.0f}%"
                  f"{' +yamnet' if args.yamnet else ''}")
        f.write(f"QC FINAL  [{checks}]\n")
        f.write(f"scanned={total}  flagged={flagged}  moved={moved}\n\n")
        f.write("\n".join(report_lines))
    print(f"Report -> {report_path.resolve()}")

    if not args.move:
        print("\nDRY-RUN: add --move to actually move suspicious files.")


if __name__ == "__main__":
    main()
