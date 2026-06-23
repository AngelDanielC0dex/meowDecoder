"""Repair corrupt cat_ids in existing embedding .npz files in-place.

The old filename parser collapsed many unrelated Pandeya clips into the
generic tokens "car" / "cat" / "Cat", creating bogus multi-class LOCO folds
and identity leakage. This script recomputes every cat_id from its file path
using the single canonical parser (parse_cat_id), which maps generic tokens to
a per-class synthetic id (pandeya_<class>) so they stay mono-class.

Use this if you do NOT want to re-run the (slow) `extract` step. If you re-run
extract with the new pipeline, cat_ids are already fixed and this is a no-op.

Usage:
  python scripts/sanitize_cat_ids.py --emb-dir data/embeddings
  python scripts/sanitize_cat_ids.py --emb-dir data/embeddings --dry-run
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import numpy as np

from meowdecoder_training.yamnet_pipeline import parse_cat_id


def main() -> None:
    ap = argparse.ArgumentParser(description="Repair cat_ids in embedding npz files")
    ap.add_argument("--emb-dir", type=Path, default=Path("data/embeddings"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    npz_files = sorted(args.emb_dir.glob("*.npz"))
    if not npz_files:
        raise SystemExit(f"No .npz under {args.emb_dir}")

    grand_changed = 0
    for npz_path in npz_files:
        cls_name = npz_path.stem
        data = np.load(npz_path, allow_pickle=True)
        old_cat = [str(x) for x in data["cat_ids"]]
        paths = [str(x) for x in data["file_paths"]]
        new_cat = [parse_cat_id(os.path.basename(p), cls_name) for p in paths]
        changed = sum(1 for a, b in zip(old_cat, new_cat) if a != b)
        grand_changed += changed
        uniq_before, uniq_after = len(set(old_cat)), len(set(new_cat))
        print(f"[{cls_name:22s}] changed={changed:5d}  "
              f"unique_cats {uniq_before} -> {uniq_after}")
        if changed and not args.dry_run:
            np.savez_compressed(
                npz_path,
                embeddings=data["embeddings"],
                labels=data["labels"],
                cat_ids=np.array(new_cat, dtype=object),
                file_paths=data["file_paths"],
            )
    print(f"\n[SUMMARY] total cat_ids changed: {grand_changed}"
          + ("  (dry-run, nothing written)" if args.dry_run else ""))


if __name__ == "__main__":
    main()
