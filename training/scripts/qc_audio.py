"""
Automatic audio QC using YAMNet (521-class AudioSet classifier).

Scans data/processed_clean/ and data/quarantine/ for files with high
probability of containing:
  - Human speech / narration / conversation
  - Music
  - Non-cat animals (dog, bird, etc.)
  - No detectable cat signal at all

Suspicious files are MOVED to data/suspicious/<class>/ for manual review.
A report is printed and saved to data/suspicious/QC_REPORT.txt.

Safe: curated files (car__, WHO, CAN, etc.) are scored but NEVER moved
      unless you pass --move-curated. Only internet-sourced files (fs_, yt_)
      are moved automatically.

Usage:
  python scripts/qc_audio.py                      # dry-run preview
  python scripts/qc_audio.py --move               # actually move flagged files
  python scripts/qc_audio.py --move --move-curated  # also move curated suspects
  python scripts/qc_audio.py --dirs data/quarantine  # quarantine only
  python scripts/qc_audio.py --speech-thr 0.05    # stricter speech threshold
"""

from __future__ import annotations

import argparse
import csv
import json
import shutil
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import tensorflow as tf
import tensorflow_hub as hub
import yaml

# ── THRESHOLDS (conservative: flag for review, not delete) ───────────────────

DEFAULT_SPEECH_THR = 0.08   # mean speech score across YAMNet frames
DEFAULT_MUSIC_THR  = 0.15   # mean music score
DEFAULT_NO_CAT_THR = 0.04   # max cat score — if below this AND top-1 non-animal → flag

# AudioSet keyword matchers (same as filter_by_audioset.py)
CAT_KW    = ["meow", "purr", "hiss", "caterwaul", "growl", "cat"]
CAT_EXCL  = ["cattle", "mastic", "pizzic", "communicat", "locat", "indicat"]
SPEECH_KW = ["speech", "conversation", "narration", "babbl", "singing", "choir",
             "shout", "yell", "whoop", "laughter", "giggle", "humming",
             "whistling", "chant", "wail", "groan", "sigh", "male speech",
             "female speech", "child speech", "monologue"]
MUSIC_KW  = ["music", "guitar", "piano", "drum", "violin", "trumpet", "flute",
             "accordion", "organ", "synthesizer", "orchestra", "harmonica"]
ANIMAL_KW = ["animal", "pets", "livestock", "bird", "dog", "rodent", "fowl"]

# Internet-source prefixes that CAN be auto-moved (curated ones require --move-curated)
INTERNET_PREFIXES = ("fs_", "yt_", "vgg_", "as_")

SR = 16000


def build_idx(names: list[str]):
    def match(kws, excl=()):
        return [i for i, n in enumerate(names)
                if any(k in n.lower() for k in kws)
                and not any(e in n.lower() for e in excl)]
    return (match(CAT_KW, CAT_EXCL), match(SPEECH_KW), match(MUSIC_KW), match(ANIMAL_KW))


def load_wav(path: Path) -> np.ndarray | None:
    try:
        pcm, sr = sf.read(str(path), dtype="float32")
    except Exception as e:
        print(f"  [ERR] read {path.name}: {e}")
        return None
    if pcm.ndim > 1:
        pcm = pcm.mean(axis=1)
    if sr != SR:
        import librosa
        pcm = librosa.resample(pcm, orig_sr=sr, target_sr=SR)
    pcm = pcm - pcm.mean()
    peak = np.abs(pcm).max()
    if peak > 1e-6:
        pcm /= peak
    min_len = int(0.96 * SR)
    if len(pcm) < min_len:
        pad = np.zeros(min_len, dtype=np.float32)
        pad[:len(pcm)] = pcm
        pcm = pad
    return pcm.astype(np.float32)


def score_clip(yamnet, pcm: np.ndarray):
    """Returns (521,) mean scores across YAMNet frames."""
    scores, _, _ = yamnet(tf.convert_to_tensor(pcm, dtype=tf.float32))
    return scores.numpy().mean(axis=0)


def is_internet_source(fname: str) -> bool:
    return any(fname.startswith(p) for p in INTERNET_PREFIXES)


def explain(scores, names, cat_i, speech_i, music_i, animal_i,
            speech_thr, music_thr, no_cat_thr):
    """Return (list_of_reasons, top3_names, cat_max, speech_max, music_max)."""
    cat_max    = float(scores[cat_i].max()) if cat_i else 0.0
    speech_max = float(scores[speech_i].max()) if speech_i else 0.0
    speech_mean= float(scores[speech_i].mean()) if speech_i else 0.0
    music_max  = float(scores[music_i].max()) if music_i else 0.0
    top3_idx   = scores.argsort()[::-1][:3]
    top3       = [f"{names[i]} ({scores[i]:.2f})" for i in top3_idx]
    animalish  = set(cat_i) | set(animal_i)
    top1       = int(scores.argmax())

    reasons = []
    if speech_mean >= speech_thr:
        best_speech = names[scores[speech_i].argmax() + min(speech_i)] if speech_i else "?"
        reasons.append(f"speech ({speech_mean:.2f} mean, best: {best_speech})")
    if music_max >= music_thr:
        best_music = names[scores[music_i].argmax() + min(music_i)] if music_i else "?"
        reasons.append(f"music ({music_max:.2f}, best: {best_music})")
    if cat_max < no_cat_thr and top1 not in animalish:
        reasons.append(f"no-cat (cat_max={cat_max:.3f}, top1={names[top1]})")
    return reasons, top3, cat_max, speech_max, music_max


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dirs", nargs="*",
                    default=["data/processed_clean", "data/quarantine"],
                    help="Directories to scan (default: both)")
    ap.add_argument("--suspicious-dir", default="data/suspicious")
    ap.add_argument("--speech-thr", type=float, default=DEFAULT_SPEECH_THR)
    ap.add_argument("--music-thr",  type=float, default=DEFAULT_MUSIC_THR)
    ap.add_argument("--no-cat-thr", type=float, default=DEFAULT_NO_CAT_THR)
    ap.add_argument("--move", action="store_true",
                    help="Actually move suspicious files (default: dry-run)")
    ap.add_argument("--move-curated", action="store_true",
                    help="Also move curated files (not just internet-sourced)")
    ap.add_argument("--yamnet-url", default="https://tfhub.dev/google/yamnet/1")
    args = ap.parse_args()

    print("[INFO] Loading YAMNet (cached)...")
    os_env = {"TFHUB_CACHE_DIR": str(Path.home() / "AppData/Local/Temp/tfhub_modules")}
    import os; os.environ.setdefault("TFHUB_CACHE_DIR", os_env["TFHUB_CACHE_DIR"])
    yamnet = hub.load(args.yamnet_url)
    names_raw = list(csv.DictReader(open(yamnet.class_map_path().numpy())))
    names = [r["display_name"] for r in names_raw]
    cat_i, speech_i, music_i, animal_i = build_idx(names)
    print(f"[INFO] CAT idx({len(cat_i)}): {[names[i] for i in cat_i]}")
    print(f"[INFO] SPEECH idx({len(speech_i)}): {[names[i] for i in speech_i[:5]]}...")
    print()

    susp_dir = Path(args.suspicious_dir)
    report_lines: list[str] = []
    total_scanned = total_flagged = total_moved = 0

    for scan_root in args.dirs:
        scan = Path(scan_root)
        if not scan.exists():
            print(f"[SKIP] {scan} not found")
            continue
        print(f"\n{'='*60}")
        print(f"Scanning: {scan}")
        print(f"{'='*60}")

        # Collect WAVs grouped by class subfolder
        wavs = sorted(scan.rglob("*.wav"))
        if not wavs:
            print("  No WAVs found.")
            continue

        for wav in wavs:
            cls = wav.parent.name
            pcm = load_wav(wav)
            if pcm is None:
                continue

            total_scanned += 1
            scores = score_clip(yamnet, pcm)
            reasons, top3, cat_max, speech_max, music_max = explain(
                scores, names, cat_i, speech_i, music_i, animal_i,
                args.speech_thr, args.music_thr, args.no_cat_thr
            )

            if not reasons:
                continue

            total_flagged += 1
            is_internet = is_internet_source(wav.name)
            will_move = args.move and (is_internet or args.move_curated)

            tag = "[MOVE]" if will_move else ("[FLAG]" if is_internet else "[FLAG-curated]")
            line = (f"{tag} {cls}/{wav.name}\n"
                    f"       reasons : {' | '.join(reasons)}\n"
                    f"       top3    : {', '.join(top3)}\n"
                    f"       cat_max={cat_max:.3f}  speech_max={speech_max:.3f}  music_max={music_max:.3f}")
            print(f"\n{line}")
            report_lines.append(line)

            if will_move:
                dst_dir = susp_dir / cls
                dst_dir.mkdir(parents=True, exist_ok=True)
                dst = dst_dir / wav.name
                shutil.move(str(wav), str(dst))
                total_moved += 1
                print(f"       -> moved to {dst}")

    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"  Scanned : {total_scanned}")
    print(f"  Flagged : {total_flagged}")
    print(f"  Moved   : {total_moved}  ({'--move not set, dry-run' if not args.move else 'check data/suspicious/'})")
    print(f"{'='*60}")

    report_path = susp_dir / "QC_REPORT.txt"
    susp_dir.mkdir(parents=True, exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(f"QC REPORT  (speech_thr={args.speech_thr}, music_thr={args.music_thr}, "
                f"no_cat_thr={args.no_cat_thr})\n")
        f.write(f"Scanned={total_scanned}  Flagged={total_flagged}  Moved={total_moved}\n\n")
        f.write("\n".join(report_lines))
    print(f"\nReport -> {report_path.resolve()}")

    if not args.move:
        print("\nDRY-RUN: add --move to actually move suspicious files.")


if __name__ == "__main__":
    import os
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
    os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
    main()
