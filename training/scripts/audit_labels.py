"""Flag likely label-noise clips via out-of-fold (OOF) confident disagreement.

Idea (confident-learning style): train a quick classifier with grouped CV so
every clip gets an out-of-fold prediction it did NOT train on. If a clip is
labeled X but the model confidently predicts Y, it is a strong candidate for
mislabeling (or an outlier). We use a fast, TF-free LogisticRegression on the
standardized YAMNet embeddings, grouped by cat_id (no identity leakage).

Outputs, per target class:
  - the top "destination" classes its clips get confused into,
  - a ranked CSV of suspect clips (highest wrong-class probability first),
    with the file path so you can listen and confirm.

Usage:
  python scripts/audit_labels.py --classes advertencia llamada_apareamiento
  python scripts/audit_labels.py                      # all classes
  python scripts/audit_labels.py --top 40 --min-prob 0.5
"""

from __future__ import annotations

import argparse
import collections
import csv
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.preprocessing import StandardScaler

CLASSES = [
    "feliz_contento", "trinos", "enfadado", "pelea", "llamada_madre",
    "llamada_apareamiento", "dolor", "descansando", "advertencia", "atencion",
]


def load_all(emb_dir: Path):
    X, y, cats, paths = [], [], [], []
    for i, c in enumerate(CLASSES):
        d = np.load(emb_dir / f"{c}.npz", allow_pickle=True)
        X.append(d["embeddings"])
        y.append(np.full(d["embeddings"].shape[0], i, dtype=int))
        cats.extend(str(x) for x in d["cat_ids"])
        paths.extend(str(x) for x in d["file_paths"])
    return (np.concatenate(X).astype(np.float32), np.concatenate(y),
            np.array(cats, dtype=object), np.array(paths, dtype=object))


def main() -> None:
    ap = argparse.ArgumentParser(description="Flag label-noise via OOF confident disagreement")
    ap.add_argument("--emb-dir", type=Path, default=Path("data/embeddings"))
    ap.add_argument("--classes", nargs="*", default=None, help="Target classes to audit")
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--top", type=int, default=30, help="Suspect clips to list per class")
    ap.add_argument("--min-prob", type=float, default=0.5,
                    help="Only flag clips where the wrong predicted class prob >= this")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    X, y, groups, paths = load_all(args.emb_dir)
    print(f"[INFO] {len(X)} samples, {len(set(groups))} cats")

    # OOF probabilities via grouped CV.
    oof_proba = np.zeros((len(X), len(CLASSES)), dtype=np.float32)
    sgkf = StratifiedGroupKFold(n_splits=args.folds, shuffle=True, random_state=args.seed)
    for tr, va in sgkf.split(X, y, groups):
        scaler = StandardScaler().fit(X[tr])
        clf = LogisticRegression(max_iter=2000, C=1.0, class_weight="balanced")
        clf.fit(scaler.transform(X[tr]), y[tr])
        p = clf.predict_proba(scaler.transform(X[va]))
        # map clf.classes_ -> full class index space
        full = np.zeros((len(va), len(CLASSES)), dtype=np.float32)
        for j, cls in enumerate(clf.classes_):
            full[:, cls] = p[:, j]
        oof_proba[va] = full

    oof_pred = oof_proba.argmax(axis=1)
    macro_seen = (oof_pred == y).mean()
    print(f"[INFO] OOF accuracy (logreg proxy): {macro_seen:.3f}\n")

    targets = args.classes or CLASSES
    out_dir = Path("artifacts/label_audit")
    out_dir.mkdir(parents=True, exist_ok=True)

    for cname in targets:
        ci = CLASSES.index(cname)
        mask = (y == ci)
        pred = oof_pred[mask]
        wrong = pred != ci
        dest = collections.Counter(CLASSES[p] for p in pred[wrong])
        n = mask.sum()
        print(f"=== {cname}  (n={n})  OOF-correct={int((pred==ci).sum())} "
              f"({100*(pred==ci).mean():.0f}%) ===")
        print("  confused into:", dict(dest.most_common(5)))

        # rank suspects: labeled cname, predicted other, by wrong-class prob
        idxs = np.where(mask)[0]
        rows = []
        for k, gi in enumerate(idxs):
            if pred[k] == ci:
                continue
            pj = int(oof_pred[gi])
            wrong_prob = float(oof_proba[gi, pj])
            true_prob = float(oof_proba[gi, ci])
            if wrong_prob >= args.min_prob:
                rows.append((wrong_prob, true_prob, CLASSES[pj], paths[gi]))
        rows.sort(reverse=True)
        csv_path = out_dir / f"{cname}.csv"
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["wrong_class_prob", "true_class_prob", "predicted_as", "file_path"])
            for r in rows:
                w.writerow([f"{r[0]:.3f}", f"{r[1]:.3f}", r[2], r[3]])
        print(f"  {len(rows)} suspects (prob>={args.min_prob}) -> {csv_path}")
        for r in rows[: args.top]:
            print(f"    p={r[0]:.2f} ->{r[2]:<20} (true_p={r[1]:.2f}) {Path(r[3]).name}")
        print()


if __name__ == "__main__":
    main()
