"""Prune confident-disagreement clips (weak-label noise) from the embeddings.

Confident-learning style: a clip labeled X is dropped only when an OOF model
assigns the TRUE class a tiny probability (< --true-max) AND another class a
high probability (> --wrong-min). Those are almost certainly weak-label noise
(e.g. VGGSound video-level tags applied to segments that don't contain the
tagged sound), not genuine hard examples.

Writes cleaned npz to --output. NON-destructive.

IMPORTANT (honesty): after pruning, the OOF macro-F1 measured on the CLEANED
set is NOT directly comparable to the original 0.45 — part of any rise is just
the removal of hard/absent validation cases. The legitimate win is a model
trained on CORRECT labels. Confirm by listening to a sample of dropped clips
(see scripts/audit_labels.py CSVs) before trusting this.

Usage:
  python scripts/prune_label_noise.py --true-max 0.05 --wrong-min 0.90 --dry-run
  python scripts/prune_label_noise.py --output data/embeddings_pruned
  # then back up data/embeddings and swap in the pruned dir, retrain.
"""

from __future__ import annotations

import argparse
import collections
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.preprocessing import StandardScaler

CLASSES = [
    "feliz_contento", "trinos", "enfadado", "pelea", "llamada_madre",
    "llamada_apareamiento", "dolor", "descansando", "advertencia", "atencion",
]


def main() -> None:
    ap = argparse.ArgumentParser(description="Prune weak-label-noise clips from embeddings")
    ap.add_argument("--emb-dir", type=Path, default=Path("data/embeddings"))
    ap.add_argument("--output", type=Path, default=Path("data/embeddings_pruned"))
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--true-max", type=float, default=0.05,
                    help="Drop only if OOF prob of the TRUE label is below this")
    ap.add_argument("--wrong-min", type=float, default=0.90,
                    help="...AND OOF prob of some OTHER class is above this")
    ap.add_argument("--protect", nargs="*", default=["dolor", "feliz_contento", "descansando"],
                    help="Classes never pruned (real CatMeows/curated data)")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    # Load per class so we can re-save per class.
    per = {}
    X, y, groups = [], [], []
    for i, c in enumerate(CLASSES):
        d = np.load(args.emb_dir / f"{c}.npz", allow_pickle=True)
        per[c] = d
        X.append(d["embeddings"])
        y.append(np.full(d["embeddings"].shape[0], i, dtype=int))
        groups.extend(str(x) for x in d["cat_ids"])
    X = np.concatenate(X).astype(np.float32)
    y = np.concatenate(y)
    groups = np.array(groups, dtype=object)

    oof = np.zeros((len(X), len(CLASSES)), dtype=np.float32)
    sgkf = StratifiedGroupKFold(n_splits=args.folds, shuffle=True, random_state=args.seed)
    for tr, va in sgkf.split(X, y, groups):
        sc = StandardScaler().fit(X[tr])
        clf = LogisticRegression(max_iter=3000, class_weight="balanced")
        clf.fit(sc.transform(X[tr]), y[tr])
        p = clf.predict_proba(sc.transform(X[va]))
        full = np.zeros((len(va), len(CLASSES)), dtype=np.float32)
        for j, cls in enumerate(clf.classes_):
            full[:, cls] = p[:, j]
        oof[va] = full

    true_prob = oof[np.arange(len(X)), y]
    best_other = oof.copy()
    best_other[np.arange(len(X)), y] = -1
    wrong_prob = best_other.max(axis=1)
    drop = (true_prob < args.true_max) & (wrong_prob > args.wrong_min)

    protect_idx = {CLASSES.index(c) for c in args.protect}
    for gi in np.where(drop)[0]:
        if y[gi] in protect_idx:
            drop[gi] = False

    print(f"[INFO] total {len(X)}  flagged-to-drop {int(drop.sum())} "
          f"(protected classes kept: {args.protect})\n")
    by_class = collections.Counter(CLASSES[y[i]] for i in np.where(drop)[0])
    for c in CLASSES:
        n = (y == CLASSES.index(c)).sum()
        print(f"  {c:22s} drop {by_class.get(c,0):4d} / {n}")

    if args.dry_run:
        print("\n[DRY-RUN] nothing written")
        return

    args.output.mkdir(parents=True, exist_ok=True)
    offset = 0
    for c in CLASSES:
        d = per[c]
        nrows = d["embeddings"].shape[0]
        local_drop = drop[offset:offset + nrows]
        offset += nrows
        keep = ~local_drop
        np.savez_compressed(
            args.output / f"{c}.npz",
            embeddings=d["embeddings"][keep],
            labels=d["labels"][keep],
            cat_ids=np.array([str(x) for x in d["cat_ids"]], dtype=object)[keep],
            file_paths=np.array([str(x) for x in d["file_paths"]], dtype=object)[keep],
        )
        print(f"  [OK] {c}: {nrows} -> {int(keep.sum())}")
    print(f"\n[DONE] cleaned embeddings -> {args.output}")


if __name__ == "__main__":
    main()
