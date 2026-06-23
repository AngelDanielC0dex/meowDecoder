"""Remove near-duplicate clips within each class by cosine similarity of their
YAMNet embeddings.

VGGSound/Freesound often contain the same audio re-uploaded. A duplicate that
lands in both train and validation is hidden leakage that inflates the metric.
This drops near-identical embeddings (cosine >= threshold), keeping one
representative per cluster. Conservative default (0.995) to avoid deleting
legitimately similar but distinct vocalizations.

Non-destructive: writes filtered npz to --output (default: data/embeddings_dedup).

Usage:
  python scripts/dedup_embeddings.py --emb-dir data/embeddings --threshold 0.995
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np


def dedup_class(emb: np.ndarray, threshold: float) -> np.ndarray:
    """Return indices to KEEP (greedy, order-preserving)."""
    n = emb.shape[0]
    if n <= 1:
        return np.arange(n)
    norm = emb / (np.linalg.norm(emb, axis=1, keepdims=True) + 1e-9)
    keep_mask = np.ones(n, dtype=bool)
    for i in range(n):
        if not keep_mask[i]:
            continue
        # cosine of i against all later, still-kept vectors
        sims = norm[i + 1:] @ norm[i]
        dup_local = np.where(sims >= threshold)[0] + (i + 1)
        for j in dup_local:
            keep_mask[j] = False
    return np.where(keep_mask)[0]


def main() -> None:
    ap = argparse.ArgumentParser(description="Drop near-duplicate embeddings")
    ap.add_argument("--emb-dir", type=Path, default=Path("data/embeddings"))
    ap.add_argument("--output", type=Path, default=Path("data/embeddings_dedup"))
    ap.add_argument("--threshold", type=float, default=0.995)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    npz_files = sorted(args.emb_dir.glob("*.npz"))
    if not npz_files:
        raise SystemExit(f"No .npz under {args.emb_dir}")
    if not args.dry_run:
        args.output.mkdir(parents=True, exist_ok=True)

    total_in = total_kept = 0
    for npz_path in npz_files:
        data = np.load(npz_path, allow_pickle=True)
        emb = data["embeddings"]
        keep = dedup_class(emb, args.threshold)
        total_in += emb.shape[0]
        total_kept += len(keep)
        print(f"[{npz_path.stem:22s}] {emb.shape[0]:5d} -> {len(keep):5d} "
              f"(removed {emb.shape[0]-len(keep)})")
        if not args.dry_run:
            np.savez_compressed(
                args.output / npz_path.name,
                embeddings=emb[keep],
                labels=data["labels"][keep],
                cat_ids=np.array([str(x) for x in data["cat_ids"]], dtype=object)[keep],
                file_paths=np.array([str(x) for x in data["file_paths"]], dtype=object)[keep],
            )
    print(f"\n[SUMMARY] {total_in} -> {total_kept} "
          f"({100*(total_in-total_kept)/max(1,total_in):.1f}% removed)"
          + ("  (dry-run)" if args.dry_run else f"  -> {args.output}"))


if __name__ == "__main__":
    main()
