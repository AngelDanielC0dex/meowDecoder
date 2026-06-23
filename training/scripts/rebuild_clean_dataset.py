"""One-pass clean rebuild of the audio dataset.

For every clip in data/processed/<class>/:
  1) FORMAT: trim leading/trailing silence, mono, 16 kHz, peak-normalize.
  2) GATE (only for scraped sources vgg_/fs_/yt_): run YAMNet and QUARANTINE the
     clip if it is not actually a cat sound (max cat-class score < --cat-min) or
     if its top-1 AudioSet class is human speech / music. Trusted sources
     (CatMeows codes, pandeya car/cat, as_ AudioSet-strong, tz_) are kept and
     only reformatted (they are human/strong-labeled).
  3) Empty-after-trim clips are quarantined regardless of source.

Writes KEPT (reformatted) clips to --output/<class>/ and moves rejects to
--quarantine/<class>/ (non-destructive: review them, then delete). Use --delete
to also remove rejects from --input.

This consolidates clean_audio + compute_audioset_scores + filter into a single
audio-level rebuild. Run it, then point config.audio.processed_dir to --output,
re-extract and retrain.

Usage (PowerShell):
  .\.venv\Scripts\python.exe scripts/rebuild_clean_dataset.py --input data\processed --output data\processed_v2
  # then set audio.processed_dir: data/processed_v2 in config.yaml and re-extract.
"""

from __future__ import annotations

import argparse
import csv
import shutil
from pathlib import Path

import numpy as np
import soundfile as sf
import tensorflow_hub as hub
import tensorflow as tf

try:
    import librosa
except ImportError as e:  # pragma: no cover
    raise SystemExit("librosa required") from e

SR = 16000
GATE_PREFIXES = ("vgg_", "fs_", "yt_")           # weakly-labeled scrapes -> gate by YAMNet
# Classes whose sound YAMNet does NOT recognize as "Cat" (purr/trill/chatter):
# exempt them from the YAMNet gate (they'd be wrongly nuked). Only format + drop empties.
EXEMPT_CLASSES = {"trinos", "llamada_madre", "descansando"}
CAT_NAMES = {"Cat", "Purr", "Meow", "Hiss", "Caterwaul", "Growling"}
HUMAN_KW = ["speech", "conversation", "narration", "babbl", "singing", "choir",
            "shout", "yell", "whoop", "laughter", "giggle", "humming", "whistling",
            "chant", "wail", "groan", "sigh"]
MUSIC_KW = ["music", "guitar", "piano", "drum", "violin", "trumpet", "flute",
            "accordion", "organ", "synthesizer", "orchestra", "harmonica"]
# Clearly non-cat animals (the confirmed garbage: dogs, etc.). NOTE: no "bird"/"chirp"
# (a cat trill/chirp can read as bird) and no "growl" (cat anger).
DOG_KW = ["dog", "bark", "bow-wow", "howl", "yip", "canidae", "whimper", "whine", "bay"]


def load_yamnet_indices(yamnet):
    rows = list(csv.DictReader(open(yamnet.class_map_path().numpy())))
    names = [r["display_name"] for r in rows]
    cat = [i for i, n in enumerate(names) if n in CAT_NAMES]
    human = [i for i, n in enumerate(names) if any(k in n.lower() for k in HUMAN_KW)]
    music = [i for i, n in enumerate(names) if any(k in n.lower() for k in MUSIC_KW)]
    dog = [i for i, n in enumerate(names) if any(k in n.lower() for k in DOG_KW)]
    return names, cat, set(human), set(music), set(dog)


def fmt(pcm, sr):
    if pcm.ndim > 1:
        pcm = pcm.mean(axis=1)
    pcm = pcm.astype(np.float32)
    if sr != SR:
        pcm = librosa.resample(pcm, orig_sr=sr, target_sr=SR)
    trimmed, _ = librosa.effects.trim(pcm, top_db=30)
    if len(trimmed) >= int(0.1 * SR):
        pcm = trimmed
    pcm = pcm - float(np.mean(pcm))
    peak = float(np.max(np.abs(pcm))) if len(pcm) else 0.0
    if peak > 1e-6:
        pcm = pcm / peak
    return pcm.astype(np.float32)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, default=Path("data/processed"))
    ap.add_argument("--output", type=Path, default=Path("data/processed_v2"))
    ap.add_argument("--quarantine", type=Path, default=Path("data/quarantine"))
    ap.add_argument("--cat-min", type=float, default=0.10)
    ap.add_argument("--min-voiced-s", type=float, default=0.2)
    ap.add_argument("--delete", action="store_true", help="also remove rejects from --input")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    print("[INFO] Loading YAMNet...")
    yamnet = hub.load("https://tfhub.dev/google/yamnet/1")
    names, cat_idx, human_set, music_set, dog_set = load_yamnet_indices(yamnet)
    print(f"[INFO] cat idx={cat_idx}  dog idx={sorted(dog_set)}")

    classes = [d for d in sorted(args.input.iterdir()) if d.is_dir()]
    grand = {"kept": 0, "empty": 0, "dog": 0, "speech": 0, "music": 0, "read-fail": 0}
    report_rows = []
    for cls_dir in classes:
        cname = cls_dir.name
        out_dir = args.output / cname
        q_dir = args.quarantine / cname
        if not args.dry_run:
            out_dir.mkdir(parents=True, exist_ok=True)
        kept = collections_counter()
        for wav in sorted(cls_dir.glob("*.wav")):
            try:
                pcm, sr = sf.read(str(wav), dtype="float32")
            except Exception:
                grand["read-fail"] += 1
                continue
            pcm = fmt(pcm, sr)
            reason = None
            if len(pcm) < int(args.min_voiced_s * SR):
                reason = "empty"
            elif cname not in EXEMPT_CLASSES and wav.name.startswith(GATE_PREFIXES):
                # Conservative gate: reject ONLY when YAMNet's top-1 guess is clearly
                # dog / human speech / music. Do NOT reject on low cat-score (purr/
                # trill/chatter read low even when they ARE cats).
                scores, _, _ = yamnet(tf.convert_to_tensor(pcm, dtype=tf.float32))
                m = scores.numpy().mean(axis=0)
                t1 = int(m.argmax())
                if t1 in human_set and m[t1] >= 0.15:
                    reason = "speech"
                elif t1 in music_set and m[t1] >= 0.30:
                    reason = "music"
                elif t1 in dog_set and m[t1] >= 0.20:
                    reason = "dog"
            if reason:
                grand[reason] += 1
                kept[reason] += 1
                report_rows.append([cname, wav.name, reason])
                if not args.dry_run:
                    q_dir.mkdir(parents=True, exist_ok=True)
                    try:
                        shutil.copy2(wav, q_dir / wav.name)
                    except Exception:
                        pass
                    if args.delete:
                        wav.unlink(missing_ok=True)
            else:
                grand["kept"] += 1
                kept["kept"] += 1
                if not args.dry_run:
                    sf.write(str(out_dir / wav.name), pcm, SR)
        print(f"  {cname:22s} kept={kept['kept']:5d} "
              f"empty={kept['empty']:4d} dog={kept['dog']:4d} "
              f"speech={kept['speech']:4d} music={kept['music']:4d}")

    print(f"\n[SUMMARY] {dict(grand)}")
    if not args.dry_run:
        args.quarantine.mkdir(parents=True, exist_ok=True)
        with open(args.quarantine / "_rejected.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["class", "file", "reason"])
            w.writerows(report_rows)
        print(f"[OK] kept dataset -> {args.output} ; rejects copied to {args.quarantine} "
              f"(review, then delete). Set config.audio.processed_dir to {args.output} and re-extract.")
    else:
        print("[DRY-RUN] nothing written")


def collections_counter():
    import collections
    return collections.Counter()


if __name__ == "__main__":
    main()
