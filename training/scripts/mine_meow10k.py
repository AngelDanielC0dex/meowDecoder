"""Inspect the Meow-10K dataset metadata to verify what we can actually use.

The Gemini and ChatGPT reports disagree on Meow-10K's fields. This loads the
real dataset and prints: the column/feature names, a few sample rows, and value
counts for any field that looks like cat identity or behavioural context, plus a
count of fight-related clips. Read-only verification (no download of the whole
set unless you drop --streaming).

SECURITY: reads the token from HF_TOKEN env var. Never hard-code it. Rotate after.

Setup (PowerShell):
  $env:HF_TOKEN = "YOUR_HF_TOKEN"
  .\.venv\Scripts\python.exe scripts/mine_meow10k.py
"""

from __future__ import annotations

import argparse
import collections
import os


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default="smgjch/meow-10k")
    ap.add_argument("--split", default="train")
    ap.add_argument("--sample", type=int, default=400, help="rows to scan for stats")
    ap.add_argument("--no-streaming", action="store_true")
    args = ap.parse_args()

    token = os.environ.get("HF_TOKEN")
    try:
        from datasets import load_dataset
    except ImportError:
        raise SystemExit("pip install datasets")

    print(f"[INFO] loading {args.repo} (streaming={not args.no_streaming})...")
    ds = load_dataset(args.repo, split=args.split, streaming=not args.no_streaming, token=token)

    # Feature/column names
    feats = getattr(ds, "features", None)
    print("\n=== FEATURES / COLUMNS ===")
    if feats:
        for k, v in feats.items():
            print(f"  {k}: {v}")
    rows = []
    it = iter(ds)
    for i, r in enumerate(it):
        if i == 0:
            print("\n=== FIRST ROW (keys) ===")
            for k, v in r.items():
                sv = str(v)
                print(f"  {k}: {sv[:90]}")
        rows.append({k: v for k, v in r.items() if not hasattr(v, "shape")})
        if len(rows) >= args.sample:
            break
    print(f"\n[INFO] scanned {len(rows)} rows")

    # We now KNOW the schema: source_cat_id (named cats), intention (context),
    # audio_path (may be None). Report exactly what matters for extraction.
    def col(k):
        return [r.get(k) for r in rows]

    cats = [str(c) for c in col("source_cat_id")]
    named = [c for c in cats if c not in ("None", "none", "")]
    print("\n=== source_cat_id ===")
    print(f"  rows with a real cat name: {len(named)}/{len(rows)}  "
          f"({len(set(named))} unique cats)")
    print(f"  clips per named cat: {collections.Counter(named).most_common(20)}")

    print("\n=== intention (context) — full distribution ===")
    intents = [str(x) for x in col("intention")]
    for v, n in collections.Counter(intents).most_common(40):
        print(f"  {n:5d}  {v}")

    # audio availability
    ap = [str(x) for x in col("audio_path")]
    have_audio = sum(1 for x in ap if x not in ("None", "none", ""))
    print("\n=== audio_path ===")
    print(f"  rows with non-null audio_path: {have_audio}/{len(rows)}")
    print(f"  examples: {[x for x in ap if x not in ('None','')][:3]}")

    # multi-context check: do named cats appear in MULTIPLE intentions?
    from collections import defaultdict
    cat2int = defaultdict(set)
    for r in rows:
        c = str(r.get("source_cat_id"))
        if c not in ("None", ""):
            cat2int[c].add(str(r.get("intention")).split(".")[0])
    multi = {c: sorted(v) for c, v in cat2int.items() if len(v) >= 2}
    print(f"\n=== multi-context named cats ({len(multi)}) ===")
    for c, v in list(multi.items())[:20]:
        print(f"  {c}: {v}")

    print("\n[NEXT] Paste this whole output. With the intention distribution + audio "
          "availability I'll write the Meow-10K extractor (map intention -> our 11 "
          "classes, cat_id = source_cat_id) and tell you how to pull the audio files.")


if __name__ == "__main__":
    main()
