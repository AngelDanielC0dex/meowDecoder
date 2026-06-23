"""Build a human-review set so you can verify labels by ear quickly.

For each requested class it copies into data/review/<class>/:
  (a) the worst OOF "suspects" — clips labeled as this class that an independent
      out-of-fold LogisticRegression confidently predicts as ANOTHER class
      (likely mislabeled), named  NN_pred-<otherclass>_p0.NN__<origfile>.wav
  (b) a random sample of clips from a given source prefix (default as_ = the new
      AudioSet downloads) so you can spot-check the freshly added data.
Plus a _manifest.csv per class.

You then listen and confirm: does the clip actually sound like the FOLDER name?
Delete the wrong ones from data/processed/<class>/ and re-extract.

Usage (PowerShell):
  .\.venv\Scripts\python.exe scripts/make_review_set.py --classes pelea trinos llamada_apareamiento advertencia
  .\.venv\Scripts\python.exe scripts/make_review_set.py --classes advertencia --new-prefix as_ --random 15
"""

from __future__ import annotations

import argparse
import csv
import random
import shutil
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.preprocessing import StandardScaler

CLASSES = [
    "feliz_contento", "trinos", "enfadado", "pelea", "llamada_madre",
    "llamada_apareamiento", "dolor", "descansando", "advertencia", "atencion",
]


def base(p: str) -> str:
    return p.replace("\\", "/").split("/")[-1]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--emb-dir", type=Path, default=Path("data/embeddings"))
    ap.add_argument("--classes", nargs="+", required=True, choices=CLASSES)
    ap.add_argument("--out", type=Path, default=Path("data/review"))
    ap.add_argument("--suspects", type=int, default=20, help="worst OOF suspects per class")
    ap.add_argument("--random", type=int, default=10, help="random new-data clips per class")
    ap.add_argument("--new-prefix", default="as_", help="source prefix to spot-check")
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    X, y, groups, paths = [], [], [], []
    for i, c in enumerate(CLASSES):
        d = np.load(args.emb_dir / f"{c}.npz", allow_pickle=True)
        X.append(d["embeddings"])
        y.append(np.full(d["embeddings"].shape[0], i, dtype=int))
        groups.extend(str(x) for x in d["cat_ids"])
        paths.extend(str(x) for x in d["file_paths"])
    X = np.concatenate(X).astype(np.float32)
    y = np.concatenate(y)
    groups = np.array(groups, dtype=object)
    paths = np.array(paths, dtype=object)

    print("[INFO] OOF logreg for mislabel detection...")
    oof = np.zeros((len(X), len(CLASSES)), dtype=np.float32)
    for tr, va in StratifiedGroupKFold(n_splits=args.folds, shuffle=True,
                                       random_state=args.seed).split(X, y, groups):
        sc = StandardScaler().fit(X[tr])
        clf = LogisticRegression(max_iter=3000, class_weight="balanced")
        clf.fit(sc.transform(X[tr]), y[tr])
        p = clf.predict_proba(sc.transform(X[va]))
        full = np.zeros((len(va), len(CLASSES)), dtype=np.float32)
        for j, cls in enumerate(clf.classes_):
            full[:, cls] = p[:, j]
        oof[va] = full
    pred = oof.argmax(1)
    rng = random.Random(args.seed)

    for cname in args.classes:
        ci = CLASSES.index(cname)
        out_dir = args.out / cname
        out_dir.mkdir(parents=True, exist_ok=True)
        idx = np.where(y == ci)[0]
        # suspects: labeled cname but predicted other, by wrong-prob desc
        sus = [(float(oof[g, pred[g]]), CLASSES[pred[g]], paths[g]) for g in idx if pred[g] != ci]
        sus.sort(reverse=True)
        rows = []
        for n, (pp, other, path) in enumerate(sus[: args.suspects]):
            src = Path(path)
            if src.exists():
                dst = out_dir / f"SUS{n:02d}_pred-{other}_p{pp:.2f}__{src.name}"
                try:
                    shutil.copy2(src, dst)
                    rows.append([dst.name, "suspect", other, f"{pp:.2f}", path])
                except Exception:
                    pass
        # random new-data spot-check
        new_idx = [g for g in idx if base(paths[g]).startswith(args.new_prefix)]
        rng.shuffle(new_idx)
        for g in new_idx[: args.random]:
            src = Path(paths[g])
            if src.exists():
                dst = out_dir / f"NEW_{src.name}"
                try:
                    shutil.copy2(src, dst)
                    rows.append([dst.name, "new-sample", "-", "-", str(paths[g])])
                except Exception:
                    pass
        with open(out_dir / "_manifest.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["review_file", "type", "model_thinks_its", "confidence", "original_path"])
            w.writerows(rows)
        print(f"  {cname:22s} -> {len(rows)} files in {out_dir} "
              f"({len(sus[:args.suspects])} suspects, {len(new_idx[:args.random])} new)")

    print("\n[DONE] Open data/review/<class>/, listen, and confirm each clip really "
          "sounds like the FOLDER name. 'SUS..' files are likely-mislabeled (the model "
          "thinks they're the class in the filename). Delete confirmed-wrong clips from "
          "data/processed/<class>/ (match by the original name after the '__'), then re-extract.")


if __name__ == "__main__":
    main()
