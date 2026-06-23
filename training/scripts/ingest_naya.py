"""
Ingest NAYA Pandeya dataset (training/data/raw/NAYA_DATA_AUG1X) into processed_clean.

The NAYA dataset is a higher-quality extended version of the Pandeya CATMood corpus
with ~300 original files per class. Each class directory also contains *_aug1(1)
augmented copies — we SKIP those (we do our own augmentation in preprocess_audio.py).

Why this is transformative for CV diversity:
  Each class has multiple source prefixes (car, cat, Last, YASH, Online, YashLL, ...).
  Output is named  naya_<prefix>__<hash8>.wav
  parse_cat_id()  extracts  "naya_<prefix>"  as the cat_id
  → 9+ unique cat_ids per class (vs 1 cat_id for all existing Pandeya files).

Class mapping:
  Angry        -> enfadado
  Defence      -> advertencia   (same class as Warning)
  Warning      -> advertencia   (both Defence and Warning map here)
  Fighting     -> pelea
  Happy        -> feliz_contento
  HuntingMind  -> trinos        (hunting chatter, merged with trinos)
  Mating       -> llamada_apareamiento
  MotherCall   -> llamada_madre
  Paining      -> dolor
  Resting      -> descansando

Usage:
  python scripts/ingest_naya.py --dry-run          # preview only, count files
  python scripts/ingest_naya.py                    # full ingest (~15 min)
  python scripts/ingest_naya.py --classes enfadado advertencia  # specific classes
"""

from __future__ import annotations

import argparse
import hashlib
import re
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

NAYA_ROOT = Path("data/raw/NAYA_DATA_AUG1X")
PROCESSED = Path("data/processed_clean")
SR = 16000

PANDEYA_MAP: dict[str, str] = {
    "Angry":       "enfadado",
    "Defence":     "advertencia",
    "Fighting":    "pelea",
    "Happy":       "feliz_contento",
    "HuntingMind": "trinos",
    "Mating":      "llamada_apareamiento",
    "MotherCall":  "llamada_madre",
    "Paining":     "dolor",
    "Resting":     "descansando",
    "Warning":     "advertencia",
}

# Minimum quality gates (conservative — qc_final.py will catch remaining issues)
MIN_DUR_S    = 0.40   # seconds after silence trim
TRIM_TOP_DB  = 30     # librosa trim threshold (dB below peak)

# ── HELPERS ───────────────────────────────────────────────────────────────────

_PREFIX_RE = re.compile(r"^([A-Za-z]+)")


def extract_prefix(stem: str) -> str:
    """First alphabetic run in filename (cat0103 -> 'cat', YASH_001 -> 'YASH')."""
    m = _PREFIX_RE.match(stem)
    return m.group(1) if m else "unknown"


def is_aug(name: str) -> bool:
    return "_aug" in name.lower()


def output_name(src: Path) -> str:
    """naya_<prefix>__<md5[:8]>.wav  — deterministic, based on full source path."""
    prefix = extract_prefix(src.stem)
    h = hashlib.md5(str(src).encode("utf-8")).hexdigest()[:8]
    return f"naya_{prefix}__{h}.wav"


def ingest_one(src: Path, dst_dir: Path, dry_run: bool) -> str:
    """
    Returns one of: 'ok', 'skip_aug', 'skip_exists', 'skip_short',
                    'skip_silent', or 'err:<message>'
    """
    if is_aug(src.name):
        return "skip_aug"

    dst = dst_dir / output_name(src)
    if dst.exists():
        return "skip_exists"

    if dry_run:
        return "ok"

    # Load MP3 via librosa (uses ffmpeg backend)
    try:
        y, _ = librosa.load(str(src), sr=SR, mono=True)
    except Exception as e:
        return f"err:{e}"

    # Basic length check before trim
    if len(y) / SR < MIN_DUR_S:
        return "skip_short"

    # Silence trim
    try:
        y_trim, _ = librosa.effects.trim(y, top_db=TRIM_TOP_DB)
    except Exception:
        y_trim = y

    if len(y_trim) / SR < MIN_DUR_S:
        return "skip_short"

    # Silence check
    peak = float(np.abs(y_trim).max())
    if peak < 1e-6:
        return "skip_silent"

    # Normalise to 0.9 peak (same as fetch_quarantine.py)
    y_norm = (y_trim / peak * 0.9).astype(np.float32)

    dst_dir.mkdir(parents=True, exist_ok=True)
    sf.write(str(dst), y_norm, SR, subtype="PCM_16")
    return "ok"


# ── MAIN ──────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest NAYA Pandeya dataset into processed_clean")
    ap.add_argument("--naya-root", default=str(NAYA_ROOT),
                    help=f"Path to NAYA_DATA_AUG1X (default: {NAYA_ROOT})")
    ap.add_argument("--out", default=str(PROCESSED),
                    help=f"Output root (default: {PROCESSED})")
    ap.add_argument("--classes", nargs="*", default=list(PANDEYA_MAP.keys()),
                    help="Which NAYA classes to ingest (Pandeya names, e.g. Angry Defence)")
    ap.add_argument("--dry-run", action="store_true",
                    help="Count files only, write nothing")
    args = ap.parse_args()

    naya = Path(args.naya_root)
    out  = Path(args.out)

    if not naya.exists():
        print(f"[ERROR] NAYA root not found: {naya.resolve()}")
        sys.exit(1)

    wanted = {c.lower() for c in args.classes}
    classes_to_process = [c for c in PANDEYA_MAP if c.lower() in wanted]

    if not classes_to_process:
        print(f"[ERROR] None of {args.classes} matched PANDEYA_MAP keys: {list(PANDEYA_MAP)}")
        sys.exit(1)

    grand: dict[str, int] = {"ok": 0, "skip_aug": 0, "skip_exists": 0,
                              "skip_short": 0, "skip_silent": 0, "err": 0}

    for naya_cls in sorted(classes_to_process):
        our_cls = PANDEYA_MAP[naya_cls]
        src_dir = naya / naya_cls
        dst_dir = out / our_cls

        if not src_dir.exists():
            print(f"[SKIP] {src_dir} not found")
            continue

        mp3s = sorted(src_dir.glob("*.mp3"))
        originals = [m for m in mp3s if not is_aug(m.name)]
        aug_count  = len(mp3s) - len(originals)

        print(f"\n[{naya_cls} -> {our_cls}]  {len(originals)} originals  "
              f"({aug_count} aug skipped)")

        counts: dict[str, int] = {k: 0 for k in grand}

        for mp3 in originals:
            result = ingest_one(mp3, dst_dir, args.dry_run)
            if result.startswith("err"):
                counts["err"] += 1
                print(f"  [ERR] {mp3.name}: {result[4:]}")
            else:
                counts[result] = counts.get(result, 0) + 1
            grand[result if not result.startswith("err") else "err"] = (
                grand.get(result if not result.startswith("err") else "err", 0) + 1
            )

        tag = "DRY " if args.dry_run else ""
        print(f"  {tag}ok={counts['ok']:3d}  "
              f"exists={counts['skip_exists']:3d}  "
              f"short={counts['skip_short']:2d}  "
              f"silent={counts['skip_silent']:2d}  "
              f"err={counts['err']:2d}")

    print(f"\n{'='*60}")
    print("NAYA INGEST COMPLETE" + (" (DRY-RUN)" if args.dry_run else ""))
    print(f"  New files added : {grand['ok']}")
    print(f"  Already existed : {grand['skip_exists']}")
    print(f"  Skipped (aug)   : {grand['skip_aug']}")
    print(f"  Too short/silent: {grand['skip_short'] + grand['skip_silent']}")
    print(f"  Errors          : {grand['err']}")
    if args.dry_run:
        print("\nAdd --dry-run=false or remove --dry-run to actually write files.")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
