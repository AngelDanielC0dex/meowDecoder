"""Convert the raw CatMeows dataset into the processed layout the loader expects.

CatMeows (Ntalampiras et al., Zenodo 4008297) encodes context in the filename:
  <CONTEXT>_<CATID>_<...>.wav  where CONTEXT ∈ {B: brushing, F: food, I: isolation}

The 11-class taxonomy maps CatMeows contexts as follows:
  B (brushing)  → feliz_contento   (positive, relaxed vocalization)
  F (food)      → atencion          (food-anticipatory meows)
  I (isolation) → dolor             (distress / isolation calls)

The cat id is preserved as a filename prefix so splits never leak a cat across
train/val (LOCO validation requirement).

Usage:
  python scripts/prepare_catmeows.py --raw data/raw/catmeows --out data/processed \\
      --label feliz_contento --context-filter B
  python scripts/prepare_catmeows.py --raw data/raw/catmeows --out data/processed \\
      --label atencion --context-filter F
  python scripts/prepare_catmeows.py --raw data/raw/catmeows --out data/processed \\
      --label dolor --context-filter I
"""

from __future__ import annotations

import argparse
import re
import uuid
from pathlib import Path

import soundfile as sf

from meowdecoder_training.dataset import load_wav_mono16k

CATMEOWS_RE = re.compile(r"^(?P<ctx>[BFI])_(?P<cat>[A-Z0-9]+)_", re.IGNORECASE)

ALLOWED_CONTEXTS: dict[str, set[str]] = {
    "feliz_contento": {"B"},
    "atencion": {"F"},
    "dolor": {"I"},
}


def _normalize_contexts(raw: str) -> set[str]:
    return {c.strip().upper() for c in raw.split(",") if c.strip()}


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Prepare CatMeows dataset for MeowDecoder (3 contexts → 3 of 11 classes)"
    )
    ap.add_argument("--raw", required=True, type=Path, help="Path to raw CatMeows folder")
    ap.add_argument("--out", default=Path("data/processed"), type=Path, help="Output processed root")
    ap.add_argument(
        "--label",
        required=True,
        choices=sorted(ALLOWED_CONTEXTS.keys()),
        help="Target MeowDecoder class for this run",
    )
    ap.add_argument(
        "--context-filter",
        required=True,
        help="Comma-separated CatMeows contexts to keep (e.g. B, F, I). "
        "For 11-class mapping, only one of {B, F, I} per run is meaningful.",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="List what would be processed without writing files",
    )
    args = ap.parse_args()

    allowed = _normalize_contexts(args.context_filter)
    valid_for_label = ALLOWED_CONTEXTS[args.label]
    bad = allowed - valid_for_label
    if bad:
        ap.error(
            f"Context(s) {sorted(bad)} cannot be mapped to label '{args.label}'. "
            f"Allowed contexts for this label: {sorted(valid_for_label)}"
        )

    dst = args.out / args.label
    if not args.dry_run:
        dst.mkdir(parents=True, exist_ok=True)

    total = 0
    matched = 0
    skipped_ctx = 0
    skipped_parse = 0
    cat_ids: set[str] = set()

    for wav in sorted(args.raw.glob("*.wav")):
        total += 1
        m = CATMEOWS_RE.match(wav.name)
        if not m:
            skipped_parse += 1
            continue
        ctx = m.group("ctx").upper()
        if ctx not in allowed:
            skipped_ctx += 1
            continue
        cat = m.group("cat")
        cat_ids.add(cat)
        if args.dry_run:
            matched += 1
            continue
        pcm = load_wav_mono16k(wav)
        out_name = f"{cat}__{uuid.uuid4().hex[:8]}.wav"
        sf.write(str(dst / out_name), pcm, 16000)
        matched += 1

    print(
        f"[{args.label} <- ctx={''.join(sorted(allowed))}] "
        f"scanned={total} kept={matched} skipped_ctx={skipped_ctx} "
        f"skipped_parse={skipped_parse} unique_cats={len(cat_ids)} -> {dst}"
    )


if __name__ == "__main__":
    main()
