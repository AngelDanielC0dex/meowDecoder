"""Remove all augmented files from data/processed, keeping only the originals.

The preprocess_audio.py script generates filenames like
`<cat_id>__aug0__<uuid>.wav` (or `aug1`, `aug2`). It only ever APPENDS new
files; it never deletes anything. After multiple runs we accumulate
augmented copies on top of copies. This helper keeps the directory clean
by deleting every wav whose stem contains `__aug` followed by a digit.

Run with --dry-run first to see what would be removed.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# Matches the aug filename marker `__aug<N>__` for ANY digit count (preprocess
# emits 2-4 digits, e.g. __aug50__ or __aug5230__). The previous {3,6} bound
# missed 2-digit suffixes and left orphan aug files behind.
AUG_PATTERN = re.compile(r"__aug\d+__")


def main() -> None:
    ap = argparse.ArgumentParser(description="Strip old augmented files from data/processed")
    ap.add_argument("--root", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    total_kept = 0
    total_removed = 0
    for cls_dir in sorted(args.root.iterdir()):
        if not cls_dir.is_dir():
            continue
        kept = 0
        removed = 0
        for wav in sorted(cls_dir.glob("*.wav")):
            if AUG_PATTERN.search(wav.name):
                if not args.dry_run:
                    wav.unlink(missing_ok=True)
                removed += 1
            else:
                kept += 1
        total_kept += kept
        total_removed += removed
        action = "would remove" if args.dry_run else "removed"
        print(f"  [{cls_dir.name}] kept={kept} {action}={removed}")

    verb = "would remove" if args.dry_run else "removed"
    print(f"\n[OK] kept={total_kept} {verb}={total_removed}")


if __name__ == "__main__":
    main()
