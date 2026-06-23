"""
Ingest the DynamicSuperb CatEmotionClassification (Pandeya "Cat Sound
Classification V2") dataset from Hugging Face into our quarantine for review.

ADAPTED TO THIS PROJECT'S PIPELINE (do NOT use the upstream 0.975 s chunker):
  * We write WHOLE clips (16 kHz mono, silence-trimmed, capped, peak-normalized),
    not YAMNet 0.975 s windows. `extract` does its own framing and the
    augmentation + prosodic cache run on whole clips; pre-chunking would break
    cat_id grouping and starve the prosodic features (F0 contour, jitter, HNR).
  * Output goes to data/quarantine/<class>/ for dedup + QC + manual review,
    NOT straight into processed_clean.

⚠️ LIKELY DUPLICATE: this is the Pandeya corpus — the SAME source as
   NAYA_DATA_AUG1X, already ingested. Run scripts/dedup_against_existing.py
   afterwards; expect a large fraction to be content-identical to what we have.

cat_id: each HF row becomes its own group  ds_<row_index>  (we have no per-cat
   metadata). Filenames are  ds_<i>__<hash8>.wav  so parse_cat_id() reads
   "ds_<i>" as the group. Survivors after dedup are few; revisit grouping only
   if many remain.

Label mapping (HF label -> our class); defaults to the weak classes only:
  mating  -> llamada_apareamiento
  paining -> dolor
  happy   -> feliz_contento
  (opt, via --classes) warning -> advertencia ; mother_call -> llamada_madre

Setup:
  .venv/Scripts/python.exe -m pip install datasets soundfile librosa

Usage:
  python scripts/ingest_dynsuperb.py --dry-run
  python scripts/ingest_dynsuperb.py
  python scripts/ingest_dynsuperb.py --classes mating paining happy warning
  python scripts/ingest_dynsuperb.py --max-per-class 400
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

import numpy as np

try:
    import librosa
    import soundfile as sf
except ImportError as e:
    raise SystemExit(f"librosa and soundfile required: pip install librosa soundfile\n{e}") from e

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# ── CONFIG ────────────────────────────────────────────────────────────────────

HF_REPO = "DynamicSuperb/CatEmotionClassification_CatSoundClassificationDataset-V2"
QUARANTINE = Path("data/quarantine")
SR = 16000
MAX_DURATION_S = 10.0   # match fetch_quarantine: cap long clips
MIN_DURATION_S = 0.40   # after silence trim
TRIM_TOP_DB = 30

# HF label (normalized) -> our class.
LABEL_MAP: dict[str, str] = {
    "mating": "llamada_apareamiento",
    "paining": "dolor",
    "pain": "dolor",
    "happy": "feliz_contento",
    "warning": "advertencia",
    "mother_call": "llamada_madre",
    "mothercall": "llamada_madre",
}
# Only the weak classes DynamicSuperb can actually help with (atención is NOT here).
DEFAULT_CLASSES = ["mating", "paining", "happy"]


def norm_label(raw: object) -> str:
    return str(raw).strip().lower().replace(" ", "_").replace("-", "_")


def process_clip(arr: np.ndarray, orig_sr: int) -> np.ndarray | None:
    """16k mono, cap, silence-trim, peak-normalize. None if too short/silent."""
    y = np.asarray(arr, dtype=np.float32)
    if y.ndim > 1:
        y = y.mean(axis=1)  # downmix to mono
    if orig_sr != SR:
        y = librosa.resample(y=y, orig_sr=orig_sr, target_sr=SR)
    y = y[: int(SR * MAX_DURATION_S)]
    if len(y) / SR < MIN_DURATION_S:
        return None
    try:
        y_trim, _ = librosa.effects.trim(y, top_db=TRIM_TOP_DB)
    except Exception:
        y_trim = y
    if len(y_trim) / SR < MIN_DURATION_S:
        return None
    peak = float(np.abs(y_trim).max())
    if peak < 1e-6:
        return None
    return (y_trim / peak * 0.9).astype(np.float32)


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest DynamicSuperb CatEmotion dataset into quarantine")
    ap.add_argument("--out", default=str(QUARANTINE))
    ap.add_argument("--classes", nargs="*", default=DEFAULT_CLASSES,
                    help="HF labels to keep (default: mating paining happy)")
    ap.add_argument("--max-per-class", type=int, default=0, help="0 = no cap")
    ap.add_argument("--split", default="train")
    ap.add_argument("--dry-run", action="store_true", help="Count only, write nothing")
    args = ap.parse_args()

    try:
        from datasets import load_dataset
    except ImportError:
        raise SystemExit("datasets required: .venv/Scripts/python.exe -m pip install datasets")

    wanted = {norm_label(c) for c in args.classes}
    unknown = wanted - set(LABEL_MAP)
    if unknown:
        print(f"[WARN] ignoring labels not in map: {sorted(unknown)}")
    wanted &= set(LABEL_MAP)
    if not wanted:
        print(f"[ERROR] no valid classes. Choose from: {sorted(LABEL_MAP)}")
        sys.exit(1)

    print(f"Loading {HF_REPO} (split={args.split}) ...")
    ds = load_dataset(HF_REPO, split=args.split)

    # Map ClassLabel ints -> strings if needed.
    label_feature = ds.features.get("label") if hasattr(ds, "features") else None

    def to_label_str(v: object) -> object:
        try:
            if label_feature is not None and hasattr(label_feature, "int2str") and isinstance(v, int):
                return label_feature.int2str(v)
        except Exception:
            pass
        return v

    out = Path(args.out)
    seen: dict[str, int] = {}
    written: dict[str, int] = {}

    for i, item in enumerate(ds):
        raw = item.get("label")
        if raw is None:
            if i == 0:
                print(f"[ERROR] dataset has no 'label' column. Keys: {list(item.keys())}")
                sys.exit(1)
            continue
        lab = norm_label(to_label_str(raw))
        if lab not in wanted:
            continue
        our_cls = LABEL_MAP[lab]
        seen[our_cls] = seen.get(our_cls, 0) + 1
        if args.max_per_class and written.get(our_cls, 0) >= args.max_per_class:
            continue

        dst = out / our_cls / f"ds_{i}__{hashlib.md5(f'{HF_REPO}:{i}'.encode()).hexdigest()[:8]}.wav"
        if dst.exists():
            written[our_cls] = written.get(our_cls, 0) + 1
            continue
        if args.dry_run:
            written[our_cls] = written.get(our_cls, 0) + 1
            continue

        audio = item.get("audio") or {}
        arr, sr = audio.get("array"), audio.get("sampling_rate")
        if arr is None or sr is None:
            continue
        y = process_clip(np.asarray(arr, dtype=np.float32), int(sr))
        if y is None:
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(dst), y, SR, subtype="PCM_16")
        written[our_cls] = written.get(our_cls, 0) + 1
        if written[our_cls] % 50 == 0:
            print(f"  {our_cls}: {written[our_cls]} written")

    print("\n" + "=" * 60)
    print("DYNSUPERB INGEST" + (" (DRY-RUN)" if args.dry_run else "") + " COMPLETE")
    for cls in sorted(seen):
        print(f"  {cls:22s} seen={seen[cls]:4d}  written={written.get(cls, 0):4d}")
    print(f"\nWrote to quarantine: {out.resolve()}")
    print("NEXT (critical — likely Pandeya/NAYA overlap):")
    print("  python scripts/dedup_against_existing.py --prefix ds_ --dry-run")
    print("  python scripts/dedup_against_existing.py --prefix ds_ --move")
    print("=" * 60)


if __name__ == "__main__":
    main()
