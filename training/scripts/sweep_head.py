"""Time-boxed, unattended hyperparameter sweep for the classifier head.

Runs OOF (StratifiedGroupKFold) for a grid of head architectures / dropout /
learning rate / majority_cap, logging pooled macro-F1 + weighted-F1 per trial
to artifacts/sweep_results.csv (appended live). When the unique grid is
exhausted it keeps going with new random seeds (robustness/variance estimate),
so it always fills the window. A HARD wall-clock budget (--max-minutes, default
243 = 4h03m) guarantees it never overruns: it will NOT start a trial that
wouldn't finish within the budget, then stops cleanly.

Does NOT overwrite your deployed model. Leaves 2 CPU cores free; never uses GPU.

Usage:
  python scripts/sweep_head.py --config config.yaml                # 243 min
  python scripts/sweep_head.py --config config.yaml --max-minutes 243
"""

from __future__ import annotations

import argparse
import copy
import csv
import itertools
import os
import time
from pathlib import Path

import numpy as np
import tensorflow as tf

_cpu = os.cpu_count() or 8
_use = max(1, _cpu - 2)
try:
    tf.config.threading.set_intra_op_parallelism_threads(_use)
    tf.config.threading.set_inter_op_parallelism_threads(2)
except Exception:
    pass

from meowdecoder_training.yamnet_pipeline import (  # noqa: E402
    load_config, load_embeddings, subsample_majority, make_sgkf_folds,
    _fit_fold, pooled_metrics,
)
from meowdecoder_training.yamnet_model import EMBEDDING_DIM  # noqa: E402


def grid():
    archs = [
        ([256, 128], [0.5, 0.4]),
        ([512, 256], [0.5, 0.4]),
        ([384, 192], [0.4, 0.3]),
        ([256, 128, 64], [0.5, 0.4, 0.3]),
        ([512, 256, 128], [0.5, 0.4, 0.3]),
        ([128, 64], [0.4, 0.3]),
    ]
    lrs = [5e-4, 1e-3]
    caps = [1200, 2000]
    out = []
    for (h, dr), lr, cap in itertools.product(archs, lrs, caps):
        out.append({"hidden": h, "dropout": dr, "lr": lr, "cap": cap})
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="config.yaml")
    ap.add_argument("--max-minutes", type=float, default=243.0)
    ap.add_argument("--safety", type=float, default=1.10,
                    help="Multiplier on the worst trial time when deciding if another fits")
    ap.add_argument("--out", default="artifacts/sweep_results.csv")
    args = ap.parse_args()

    cfg = load_config(args.config)
    classes = cfg["classes"]
    n_classes = len(classes)
    agg = cfg["yamnet"].get("aggregation", "mean")
    Xall, yall, gall = load_embeddings(classes, Path("data/embeddings"))
    # Infer input_dim from the data so prosodic features (2073) or any change in
    # aggregation are handled automatically instead of hard-coding 2048.
    input_dim = int(Xall.shape[1])
    _expected = EMBEDDING_DIM * 2 if agg == "mean_std" else EMBEDDING_DIM
    if input_dim != _expected:
        print(f"[INFO] input_dim={input_dim} (base {_expected} + {input_dim - _expected} extra)")
    base_seed = cfg["train"].get("seed", 42)

    Path("artifacts").mkdir(exist_ok=True)
    new_file = not Path(args.out).exists()
    f = open(args.out, "a", newline="", encoding="utf-8")
    w = csv.writer(f)
    if new_file:
        w.writerow(["pass", "seed", "hidden", "dropout", "lr", "cap",
                    "oof_macro_f1", "oof_weighted_f1", "minutes"])
        f.flush()

    configs = grid()
    start = time.time()
    budget = args.max_minutes
    times: list[float] = []
    best = (-1.0, None, None)
    n_done = 0
    print(f"[INFO] Budget {budget:.0f} min. {len(configs)} configs/pass, then seed re-runs. "
          f"Threads={_use}. Live results -> {args.out}")

    stop = False
    for p in range(1000):
        if stop:
            break
        seed = base_seed + p
        for t in configs:
            elapsed = (time.time() - start) / 60.0
            est = (max(times) * args.safety) if times else 25.0
            remaining = budget - elapsed
            if elapsed + est > budget:
                print(f"[STOP] {elapsed:.1f} min elapsed, ~{est:.1f} min/trial won't fit "
                      f"in remaining {remaining:.1f} min. Stopping cleanly.")
                stop = True
                break

            t0 = time.time()
            c = copy.deepcopy(cfg)
            c["yamnet"]["head_hidden_layers"] = t["hidden"]
            c["yamnet"]["head_dropout"] = t["dropout"]
            c["train"]["lr"] = t["lr"]
            np.random.seed(seed)
            tf.random.set_seed(seed)
            keep = subsample_majority(yall, gall, t["cap"], seed)
            X, y, g = Xall[keep], yall[keep], gall[keep]

            oof_t, oof_p = [], []
            for tr, va in make_sgkf_folds(X, y, g, c["train"].get("cv_folds", 5), seed):
                proba = _fit_fold(c, X[tr], y[tr], X[va], y[va], input_dim, n_classes)
                oof_t.append(y[va])
                oof_p.append(proba.argmax(axis=1))
            m = pooled_metrics(np.concatenate(oof_t), np.concatenate(oof_p), classes)
            mins = (time.time() - t0) / 60.0
            times.append(mins)
            n_done += 1
            w.writerow([p, seed, "x".join(map(str, t["hidden"])),
                        "/".join(map(str, t["dropout"])), t["lr"], t["cap"],
                        f"{m['macro_f1']:.4f}", f"{m['weighted_f1']:.4f}", f"{mins:.1f}"])
            f.flush()
            flag = ""
            if m["macro_f1"] > best[0]:
                best = (m["macro_f1"], t, seed)
                flag = "  <-- best so far"
            tot = (time.time() - start) / 60.0
            print(f"[#{n_done} p{p}] {t}  macroF1={m['macro_f1']:.4f}  "
                  f"({mins:.1f} min, {tot:.0f}/{budget:.0f} total){flag}")

    f.close()
    total = (time.time() - start) / 60.0
    print(f"\n[DONE] ran {n_done} trials in {total:.1f} min "
          f"(budget {budget:.0f}). best macro-F1={best[0]:.4f} with {best[1]} (seed {best[2]}).")
    print(f"Ranked results: {args.out}")


if __name__ == "__main__":
    main()
