"""Phase 1: calibrate per-class confidence thresholds on OOF probabilities.

Macro-F1 is the wrong target for a consumer app. What matters is: "when the
model commits to an answer, how often is it right (precision), and on how many
inputs does it commit (coverage)?". This script reads the out-of-fold
probabilities saved by `train` (artifacts/oof_predictions.npz) and, for each
class, finds the minimum probability threshold that reaches a target precision.
Predictions below their class threshold become `unknown` (honest deferral).

Outputs artifacts/thresholds.json with per-class thresholds + a
precision/coverage report, and a suggested global threshold for contract.ts.

Usage:
  python scripts/calibrate_thresholds.py --target-precision 0.70
  python scripts/calibrate_thresholds.py --target-precision 0.80 --min-coverage 0.2
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

CLASSES = [
    "feliz_contento", "trinos", "enfadado", "pelea", "llamada_madre",
    "llamada_apareamiento", "dolor", "descansando", "advertencia", "atencion",
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--oof", default="artifacts/oof_predictions.npz")
    ap.add_argument("--target-precision", type=float, default=0.70)
    ap.add_argument("--min-coverage", type=float, default=0.05,
                    help="If target precision needs dropping >this fraction of a class, "
                         "report it as 'needs data' instead of forcing a huge threshold")
    ap.add_argument("--out", default="artifacts/thresholds.json")
    args = ap.parse_args()

    d = np.load(args.oof)
    y, P = d["y_true"], d["proba"]
    pred = P.argmax(axis=1)
    conf = P.max(axis=1)

    print(f"OOF samples: {len(y)}\n")
    print(f"{'class':22s} {'thr':>5} {'prec@thr':>9} {'recall@thr':>11} {'covered':>8} verdict")
    thresholds = {}
    report = {}
    grid = np.round(np.arange(0.20, 0.96, 0.01), 2)
    for ci, cname in enumerate(CLASSES):
        # candidate predictions for this class
        is_pred = pred == ci
        support = int((y == ci).sum())
        best_thr, best = None, None
        for t in grid:
            sel = is_pred & (conf >= t)
            k = int(sel.sum())
            if k == 0:
                continue
            prec = float((y[sel] == ci).mean())
            if prec >= args.target_precision:
                rec = float(((y == ci) & sel).sum() / max(1, support))
                best_thr, best = float(t), (prec, rec, k)
                break  # smallest threshold reaching target precision
        if best_thr is None:
            # cannot reach target precision at any threshold -> needs data / merge
            sel = is_pred
            prec = float((y[sel] == ci).mean()) if sel.sum() else 0.0
            thresholds[cname] = 0.99
            report[cname] = {"reachable": False, "best_precision": round(prec, 3),
                             "support": support}
            print(f"{cname:22s} {'--':>5} {prec:>9.2f} {'--':>11} {'--':>8} NEEDS DATA/MERGE")
        else:
            prec, rec, k = best
            cov = k / max(1, len(y))
            thresholds[cname] = best_thr
            report[cname] = {"reachable": True, "threshold": best_thr,
                             "precision": round(prec, 3), "recall": round(rec, 3),
                             "covered_n": k, "support": support}
            tag = "OK" if rec >= 0.3 else "OK (low recall)"
            print(f"{cname:22s} {best_thr:>5.2f} {prec:>9.2f} {rec:>11.2f} {k:>8d} {tag}")

    # Overall: with these thresholds, coverage & precision on committed answers.
    committed = np.zeros(len(y), dtype=bool)
    correct = 0
    for i in range(len(y)):
        ci = int(pred[i])
        if conf[i] >= thresholds[CLASSES[ci]]:
            committed[i] = True
            if y[i] == ci:
                correct += 1
    cov = committed.mean()
    prec = correct / max(1, committed.sum())
    print(f"\n[OVERALL] coverage={cov:.2f}  precision-when-committed={prec:.2f}  "
          f"(the rest -> 'unknown')")

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(
        {"target_precision": args.target_precision,
         "per_class_threshold": thresholds,
         "report": report,
         "overall": {"coverage": round(float(cov), 3),
                     "precision_when_committed": round(float(prec), 3)}},
        indent=2, ensure_ascii=False))
    print(f"[OK] -> {args.out}")
    print("\nNext: port per_class_threshold into the web app's confidence policy "
          "(contract.ts), and treat 'NEEDS DATA/MERGE' classes as Phase 3 targets.")


if __name__ == "__main__":
    main()
