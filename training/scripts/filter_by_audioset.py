"""Drop clips that YAMNet (AudioSet) says are NOT cat sounds — automatic,
listening-free label validation.

Uses cached per-clip AudioSet scores (compute_audioset_scores.py). For each
INTERNET-sourced clip (cat_id starting with vgg_ / fs_) it looks at YAMNet's
TOP-1 AudioSet guess for the clip; if that top guess is human speech (or music)
with decent confidence, the clip is dropped. Curated clips (CatMeows codes,
pandeya_*) are never touched. Optionally also drop clips with essentially no
cat signal (--drop-no-cat).

Top-1-based logic is deliberately conservative: a real but unusual cat sound
(trill, hunting chatter) keeps a cat/animal top-1 guess, so it is NOT dropped;
only clips whose single most likely sound is speech/music get removed.

Groups are built by NAME from the AudioSet class map (printed for verification).

Self-check: if scripts/audit_labels.py produced artifacts/label_audit/*.csv,
prints how many of those human-confirmed suspects the gate catches.

Outputs filtered embeddings to --output (default data/embeddings_clean).

Usage:
  python scripts/filter_by_audioset.py --dry-run
  python scripts/filter_by_audioset.py --output data/embeddings_clean
"""

from __future__ import annotations

import argparse
import collections
import csv
import json
from pathlib import Path

import numpy as np

CLASSES = [
    "feliz_contento", "trinos", "enfadado", "pelea", "llamada_madre",
    "llamada_apareamiento", "dolor", "descansando", "advertencia", "atencion",
]

CAT_KW = ["meow", "purr", "hiss", "caterwaul", "growl", "cat"]
CAT_EXCLUDE = ["cattle", "mastic", "pizzic", "communicat", "locat", "indicat"]
ANIMAL_KW = ["animal", "pets", "livestock", "fowl", "bird", "dog", "rodent"]
HUMAN_KW = ["speech", "conversation", "narration", "babbl", "singing", "choir",
            "shout", "yell", "whoop", "laughter", "giggle", "humming",
            "whistling", "chant", "wail", "groan", "sigh"]
MUSIC_KW = ["music", "guitar", "piano", "drum", "violin", "trumpet", "flute",
            "accordion", "organ", "synthesizer", "orchestra", "harmonica"]


def basename(p: str) -> str:
    return p.replace("\\", "/").split("/")[-1]


def build_groups(names):
    def match(kws, exclude=()):
        out = []
        for i, n in enumerate(names):
            ln = n.lower()
            if any(k in ln for k in kws) and not any(e in ln for e in exclude):
                out.append(i)
        return out
    return (match(CAT_KW, CAT_EXCLUDE), match(ANIMAL_KW),
            match(HUMAN_KW), match(MUSIC_KW))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scores", default="data/audioset_scores.npz")
    ap.add_argument("--class-map", default="data/audioset_class_map.json")
    ap.add_argument("--emb-dir", type=Path, default=Path("data/embeddings"))
    ap.add_argument("--output", type=Path, default=Path("data/embeddings_clean"))
    ap.add_argument("--human-min", type=float, default=0.15,
                    help="Min top-1 speech score to drop a speech-dominated clip")
    ap.add_argument("--music-min", type=float, default=0.30)
    ap.add_argument("--cat-min", type=float, default=0.02)
    ap.add_argument("--drop-no-cat", action="store_true",
                    help="Also drop internet clips whose top-1 is non-animal AND cat<cat-min")
    ap.add_argument("--strict", action="store_true",
                    help="STRICT: drop ANY internet clip with no cat evidence "
                         "(max cat-class score < --strict-cat-min), regardless of top-1. "
                         "Catches 'not even a cat sound' clips, not just speech/music.")
    ap.add_argument("--strict-cat-min", type=float, default=0.10)
    ap.add_argument("--sources", nargs="*", default=["vgg_", "fs_"])
    ap.add_argument("--dropped-list", default="data/dropped_files.txt",
                    help="Write the original paths of dropped clips here (for deletion).")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    names = json.loads(Path(args.class_map).read_text())
    cat_i, animal_i, human_i, music_i = build_groups(names)
    human_set, music_set = set(human_i), set(music_i)
    animalish = set(cat_i) | set(animal_i)
    print("CAT classes   :", [names[i] for i in cat_i])
    print("HUMAN classes :", [names[i] for i in human_i])
    print("MUSIC classes :", [names[i] for i in music_i], "\n")

    sc = np.load(args.scores, allow_pickle=True)
    sfiles = [basename(str(x)) for x in sc["file_names"]]
    S = sc["scores"]
    top1 = S.argmax(axis=1)
    cat_s = S[:, cat_i].max(axis=1)
    hum_s = S[:, human_i].max(axis=1)
    mus_s = S[:, music_i].max(axis=1) if music_i else np.zeros(len(S))
    info = {f: (int(top1[i]), float(cat_s[i]), float(hum_s[i]), float(mus_s[i]))
            for i, f in enumerate(sfiles)}

    def decide(fname, cat_id):
        if not any(str(cat_id).startswith(p) for p in args.sources):
            return False, "curated"
        v = info.get(fname)
        if v is None:
            return False, "no-score"
        t1, cat, hum, mus = v
        if t1 in human_set and hum >= args.human_min:
            return True, "speech"
        if t1 in music_set and mus >= args.music_min:
            return True, "music"
        if args.strict and cat < args.strict_cat_min:
            return True, "no-cat-strict"
        if args.drop_no_cat and t1 not in animalish and cat < args.cat_min:
            return True, "no-cat"
        return False, "ok"

    if not args.dry_run:
        args.output.mkdir(parents=True, exist_ok=True)
    reasons = collections.Counter()
    dropped_paths: list[str] = []
    gin = gkeep = 0
    for c in CLASSES:
        d = np.load(args.emb_dir / f"{c}.npz", allow_pickle=True)
        paths = [str(x) for x in d["file_paths"]]
        cats = [str(x) for x in d["cat_ids"]]
        keep = np.ones(len(paths), dtype=bool)
        for k, (p, cid) in enumerate(zip(paths, cats)):
            drop, why = decide(basename(p), cid)
            if drop:
                keep[k] = False
                reasons[why] += 1
                dropped_paths.append(p)
        gin += len(paths)
        gkeep += int(keep.sum())
        print(f"  {c:22s} {len(paths):5d} -> {int(keep.sum()):5d}  (drop {int((~keep).sum())})")
        if not args.dry_run:
            np.savez_compressed(
                args.output / f"{c}.npz",
                embeddings=d["embeddings"][keep],
                labels=d["labels"][keep],
                cat_ids=np.array(cats, dtype=object)[keep],
                file_paths=np.array(paths, dtype=object)[keep],
            )
    print(f"\n[SUMMARY] {gin} -> {gkeep}  drop reasons: {dict(reasons)}")
    if dropped_paths and not args.dry_run:
        Path(args.dropped_list).parent.mkdir(parents=True, exist_ok=True)
        Path(args.dropped_list).write_text("\n".join(dropped_paths), encoding="utf-8")
        print(f"[OK] {len(dropped_paths)} dropped paths -> {args.dropped_list} "
              f"(delete them from data/processed so future extracts stay clean)")

    audit_dir = Path("artifacts/label_audit")
    if audit_dir.exists():
        print("\n[SELF-CHECK] gate vs audit-flagged (human-confirmed) suspects:")
        for csvf in sorted(audit_dir.glob("*.csv")):
            rows = list(csv.DictReader(open(csvf, encoding="utf-8")))
            if not rows:
                continue
            caught = 0
            for r in rows:
                v = info.get(basename(r["file_path"]))
                if not v:
                    continue
                t1, cat, hum, mus = v
                if (t1 in human_set and hum >= args.human_min) or \
                   (t1 in music_set and mus >= args.music_min) or \
                   (args.drop_no_cat and t1 not in animalish and cat < args.cat_min):
                    caught += 1
            print(f"   {csvf.stem:22s} catches {caught}/{len(rows)} ({100*caught/len(rows):.0f}%)")
    if args.dry_run:
        print("\n[DRY-RUN] nothing written")


if __name__ == "__main__":
    main()
