"""Check class balance and cat_id distribution in the processed dataset.

Uses the canonical `parse_cat_id` from yamnet_pipeline so cat-ID counts
match exactly what the training pipeline sees (including the remapping of
generic tokens like `car`/`cat` to per-class synthetic IDs).

Usage:
  python scripts/check_class_balance.py --data data/processed
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from meowdecoder_training.yamnet_pipeline import parse_cat_id


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=Path("data/processed"), type=Path)
    args = ap.parse_args()

    total = 0
    all_cats: set[str] = set()
    rows = []

    for cls_dir in sorted(args.data.iterdir()):
        if not cls_dir.is_dir():
            continue
        cls_name = cls_dir.name
        wavs = list(cls_dir.glob("*.wav"))
        cat_ids = {parse_cat_id(wav.name, cls_name) for wav in wavs}
        all_cats.update(cat_ids)
        rows.append((cls_name, len(wavs), len(cat_ids)))
        total += len(wavs)

    print(f"\n{'Class':<25} {'Samples':>8} {'Cat IDs':>8}")
    print("-" * 45)
    for cls_name, n_samples, n_cats in rows:
        flag = " ⚠" if n_samples < 100 else ""
        print(f"{cls_name:<25} {n_samples:>8} {n_cats:>8}{flag}")
    print("-" * 45)
    print(f"{'TOTAL':<25} {total:>8} {len(all_cats):>8}")
    print(f"\nUnique cat IDs across all classes: {len(all_cats)}")

    low = [r for r in rows if r[1] < 100]
    if low:
        print("\n[WARN] Classes with <100 samples:")
        for cls_name, n, _ in low:
            print(f"  {cls_name}: {n} samples")


if __name__ == "__main__":
    main()
