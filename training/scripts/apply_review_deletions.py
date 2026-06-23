"""Delete the ORIGINAL clips that were copied into data/review/ (you confirmed
they are all wrong). Reads each data/review/<class>/_manifest.csv and removes the
`original_path` files from data/processed.

Safe by default (--dry-run shows what it would delete). Use --apply to delete.

Usage (PowerShell):
  .\.venv\Scripts\python.exe scripts/apply_review_deletions.py            # dry-run
  .\.venv\Scripts\python.exe scripts/apply_review_deletions.py --apply
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--review", type=Path, default=Path("data/review"))
    ap.add_argument("--apply", action="store_true", help="actually delete (default: dry-run)")
    args = ap.parse_args()

    manifests = sorted(args.review.glob("*/_manifest.csv"))
    if not manifests:
        raise SystemExit(f"No _manifest.csv under {args.review}")

    total = deleted = missing = 0
    for m in manifests:
        with open(m, encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        for r in rows:
            orig = r.get("original_path", "").strip()
            if not orig:
                continue
            total += 1
            p = Path(orig)
            if not p.exists():
                missing += 1
                continue
            if args.apply:
                try:
                    p.unlink()
                    deleted += 1
                except Exception as e:
                    print(f"  [FAIL] {p}: {e}")
            else:
                print(f"  would delete: {p}")
    action = "deleted" if args.apply else "would delete"
    print(f"\n[SUMMARY] {total} referenced, {action} {deleted if args.apply else total - missing}, "
          f"{missing} already gone."
          + ("" if args.apply else "  (dry-run; add --apply to delete)"))


if __name__ == "__main__":
    main()
