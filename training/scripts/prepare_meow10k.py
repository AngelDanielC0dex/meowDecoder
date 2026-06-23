"""Prepare the Meow-10K dataset (Hugging Face: smgjch/meow-10k) for MeowDecoder.

Meow-10K is a multimodal behavior dataset. Its `intention` field describes
broad behaviors; only a small fraction are vocalization-like. We map the
vocalization-adjacent intentions to the 11-class taxonomy and skip the rest
(those samples can still be useful for an `unknown` class if desired, but
this script currently drops them by design — see the mapping table below).

The script expects the raw dataset to be already downloaded under
data/raw/meow10k/. Two on-disk layouts are supported:

  A) Hugging Face snapshot (preferred):
     data/raw/meow10k/
       meowOmni1_train.json          (the full metadata; contains audio_path)
       data/audios/audio/*.wav       (or wherever the audio lives)

  B) Flat layout (already-normalized, no metadata):
     data/raw/meow10k/*.wav          (no intention labels — processed as unknown)

When layout A is detected, this script:
  1. Loads meowOmni1_train.json (or any *.json with the same schema)
  2. Filters rows that have an audio file on disk and an `intention` we map
  3. Applies the same 16 kHz mono + high-pass + peak-norm preprocessing
  4. Writes data/processed/<class>/<cat_id>__<uuid>.wav

Mapping (only intentions with audio actually present on disk in the snapshot):

  inactive_lying.crouch       → descansando
  inactive_lying.down         → descansando
  inactive_lying.resting      → descansando
  inactive_lying.stationary   → descansando
  active_playfight.fighting   → pelea

The other intentions (sitting, walking, grooming, eating, etc.) are NOT
vocalization labels and would only add label noise. The vocal intentions
(purring, mewing, vocalizing) are referenced in the JSON but the audio
files are NOT included in the Hugging Face snapshot, so we skip them.

CAUTION: `inactive_lying.*` clips are labelled by BEHAVIOR (the cat is
lying down), not by the SOUND they make. A clip here may contain purring,
silence, or other vocalizations. The label is therefore noisy. Use the
data as a coarse prior for `descansando` and re-check sample quality
before trusting the macro-F1.

Usage:
  python scripts/prepare_meow10k.py --raw data/raw/meow10k --out data/processed
  python scripts/prepare_meow10k.py --raw data/raw/meow10k --out data/processed \\
      --max-per-class 200 --seed 42
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import uuid
from pathlib import Path

import soundfile as sf

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from meowdecoder_training.dataset import load_wav_mono16k

MEOW10K_INTENTIONS: dict[str, str] = {
    "inactive_lying.crouch": "descansando",
    "inactive_lying.down": "descansando",
    "inactive_lying.resting": "descansando",
    "inactive_lying.stationary": "descansando",
    "active_playfight.fighting": "pelea",
}

AUDIO_PATH_KEYS = ("audio_path", "ts_path")


def _resolve_audio(raw_dir: Path, audio_path: str) -> Path | None:
    """Resolve the on-disk path of a meow-10k audio file.

    The HF snapshot uses relative paths like
        ./data/audios/audio/tz_cat_class_00068.wav
    but the actual files in this repo sit directly under raw_dir/audios/.
    We try the literal path, the raw_dir/audios/<name> fallback, and finally
    a recursive name search.
    """
    if not audio_path:
        return None
    p = Path(audio_path)
    name = p.name
    candidates: list[Path] = []
    if p.is_absolute() and p.exists():
        return p
    candidates.append(raw_dir / p)
    candidates.append(raw_dir / "audios" / name)
    candidates.append(raw_dir / "audios" / "audio" / name)
    candidates.append(raw_dir / "audios" / "audios" / name)
    for c in candidates:
        if c.exists():
            return c
    matches = list((raw_dir / "audios").glob(name))
    return matches[0] if matches else None


def _load_metadata(raw_dir: Path) -> list[dict] | None:
    candidates = sorted(raw_dir.glob("*.json"))
    if not candidates:
        return None
    rows: list[dict] = []
    for path in candidates:
        try:
            with path.open("r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"  [WARN] Cannot read {path}: {e}")
            continue
        if isinstance(data, list):
            rows.extend(data)
        elif isinstance(data, dict):
            for key in ("data", "rows", "items"):
                if key in data and isinstance(data[key], list):
                    rows.extend(data[key])
                    break
            else:
                rows.append(data)
    return rows or None


def _pick_audio_path(row: dict) -> str | None:
    for key in AUDIO_PATH_KEYS:
        val = row.get(key)
        if isinstance(val, str) and val:
            return val
    return None


def main() -> None:
    ap = argparse.ArgumentParser(description="Prepare Meow-10K for MeowDecoder 11 classes")
    ap.add_argument("--raw", required=True, type=Path)
    ap.add_argument("--out", default=Path("data/processed"), type=Path)
    ap.add_argument("--max-per-class", type=int, default=200, help="Cap samples per target class")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument(
        "--include-unknown",
        action="store_true",
        help="If set, rows with no vocal-related intention are written to "
        "the `unknown` class for negative training (NOT in 11-class taxonomy).",
    )
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    metadata = _load_metadata(args.raw)

    if metadata is None:
        print(f"[INFO] No JSON metadata under {args.raw}; falling back to flat layout.")
        wavs = sorted(args.raw.glob("*.wav"))
        print(f"[INFO] Found {len(wavs)} flat wav files. None have intention labels; "
              "skipping (re-run with --include-unknown to write them to a junk folder).")
        return

    print(f"[INFO] Loaded {len(metadata)} metadata rows from {args.raw}")

    per_class_counter: dict[str, int] = {c: 0 for c in MEOW10K_INTENTIONS.values()}
    unknown_counter = 0
    skipped_no_audio = 0
    skipped_not_vocal = 0
    skipped_missing_file = 0
    written_total = 0
    cat_id_counter: dict[str, int] = {}

    for row in metadata:
        intention = row.get("intention")
        audio_rel = _pick_audio_path(row)
        if not audio_rel:
            skipped_no_audio += 1
            continue

        target_class = MEOW10K_INTENTIONS.get(intention)
        if target_class is None:
            if not args.include_unknown:
                skipped_not_vocal += 1
                continue
            target_class = "__unknown__"
            unknown_counter += 1

        if target_class != "__unknown__" and per_class_counter[target_class] >= args.max_per_class:
            continue

        wav_path = _resolve_audio(args.raw, audio_rel)
        if wav_path is None or not wav_path.exists():
            skipped_missing_file += 1
            continue

        source_cat = row.get("source_cat_id") or row.get("id") or "meow10k"
        cat_id_counter[source_cat] = cat_id_counter.get(source_cat, 0) + 1
        cat_id = re.sub(r"[^A-Za-z0-9_-]", "_", str(source_cat))[:32] or "meow10k"

        if args.dry_run:
            written_total += 1
            per_class_counter[target_class] = per_class_counter.get(target_class, 0) + 1
            continue

        try:
            pcm = load_wav_mono16k(wav_path)
        except Exception as e:
            print(f"  [SKIP] Cannot read {wav_path}: {e}")
            continue

        out_dir = args.out / target_class
        out_dir.mkdir(parents=True, exist_ok=True)
        out_name = f"{cat_id}__{uuid.uuid4().hex[:8]}.wav"
        sf.write(str(out_dir / out_name), pcm, 16000)
        written_total += 1
        per_class_counter[target_class] = per_class_counter.get(target_class, 0) + 1

    print()
    print("[RESULT] Meow-10K processing")
    print(f"  scanned:               {len(metadata)}")
    print(f"  skipped_no_audio:      {skipped_no_audio}")
    print(f"  skipped_not_vocal:     {skipped_not_vocal}")
    print(f"  skipped_missing_file:  {skipped_missing_file}")
    print(f"  written:               {written_total}")
    print("  per_class:")
    for cls, n in sorted(per_class_counter.items()):
        if n:
            print(f"    {cls:25s} {n}")
    print(f"  unique_cats:           {len(cat_id_counter)}")
    if args.include_unknown:
        print(f"  unknown_extra:         {unknown_counter} (NOT in 11-class taxonomy)")


if __name__ == "__main__":
    main()
