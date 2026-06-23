"""
Content-based de-duplication for freshly ingested clips.

Verifies we are not adding audio we ALREADY have — by CONTENT, not filename. The
same recording re-encoded (mp3 vs wav, different bitrate, renamed) is still
caught, because the fingerprint is acoustic, not a byte hash.

Fingerprint: 16 kHz mono -> silence-trim -> peak-normalize -> log-mel (32 mels)
-> time axis resized to a fixed 64 frames -> flattened + L2-normalized (2048-d).
Two clips are duplicates iff cosine >= --threshold AND their durations match
within --dur-tol (the duration gate stops a short clip matching a long one with
a similar average spectrum).

New clips (selected by --prefix, e.g. ds_) are compared against:
  * every clip under --existing-dir (default: processed_clean + quarantine),
    excluding the same --prefix so a batch is never its own reference, and
  * each other (running index) so intra-batch duplicates are removed too.

Duplicates are MOVED to data/_dupes/<class>/ (non-destructive) with a report so
you can eyeball the matches; pass --delete to remove instead, or --dry-run to
only report.

Usage:
  python scripts/dedup_against_existing.py --prefix ds_ --dry-run
  python scripts/dedup_against_existing.py --prefix ds_ --move
  python scripts/dedup_against_existing.py --prefix yt_ --threshold 0.96 --move
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

import numpy as np

try:
    import librosa
except ImportError as e:
    raise SystemExit(f"librosa required: pip install librosa\n{e}") from e

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SR = 16000
N_MELS = 32
N_FRAMES = 64           # fixed time length so clips of different length compare
TRIM_TOP_DB = 30
MIN_SAMPLES = int(0.2 * SR)


def fingerprint(path: Path) -> tuple[np.ndarray | None, float]:
    """(L2-normalized 2048-d fingerprint, duration_s) or (None, 0) on failure."""
    try:
        y, _ = librosa.load(str(path), sr=SR, mono=True)
    except Exception:
        return None, 0.0
    try:
        y, _ = librosa.effects.trim(y, top_db=TRIM_TOP_DB)
    except Exception:
        pass
    if len(y) < MIN_SAMPLES:
        return None, 0.0
    peak = float(np.abs(y).max())
    if peak < 1e-6:
        return None, 0.0
    y = y / peak
    dur = len(y) / SR
    mel = librosa.feature.melspectrogram(y=y, sr=SR, n_mels=N_MELS)
    logmel = librosa.power_to_db(mel)  # (N_MELS, T)
    T = logmel.shape[1]
    if T < 1:
        return None, 0.0
    # Resize the time axis to N_FRAMES via linear interpolation per mel band.
    xs = np.linspace(0, T - 1, N_FRAMES)
    src = np.arange(T)
    resized = np.stack([np.interp(xs, src, logmel[m]) for m in range(N_MELS)])
    fp = resized.flatten().astype(np.float32)
    norm = float(np.linalg.norm(fp))
    if norm < 1e-8:
        return None, 0.0
    return fp / norm, dur


def collect_wavs(dirs: list[str], prefix: str | None = None,
                 exclude_prefix: str | None = None) -> list[Path]:
    found: list[Path] = []
    for d in dirs:
        root = Path(d)
        if not root.exists():
            continue
        for w in root.rglob("*.wav"):
            # Augmented copies are derivatives of an original; comparing against
            # them is redundant (and slow). Dedup only against real recordings.
            if "__aug" in w.name:
                continue
            if prefix and not w.name.startswith(prefix):
                continue
            if exclude_prefix and w.name.startswith(exclude_prefix):
                continue
            found.append(w)
    return sorted(found)


def main() -> None:
    ap = argparse.ArgumentParser(description="Content-based dedup of newly added clips")
    ap.add_argument("--new-dir", nargs="*", default=["data/quarantine"])
    ap.add_argument("--existing-dir", nargs="*",
                    default=["data/processed_clean", "data/quarantine"])
    ap.add_argument("--prefix", default="ds_",
                    help="Only check new clips whose filename starts with this")
    ap.add_argument("--threshold", type=float, default=0.97,
                    help="Cosine >= this (and duration match) => duplicate")
    ap.add_argument("--dur-tol", type=float, default=0.15,
                    help="Max relative duration difference for a duplicate")
    ap.add_argument("--dupes-dir", default="data/_dupes")
    ap.add_argument("--move", action="store_true", help="Move dupes to --dupes-dir (default action)")
    ap.add_argument("--delete", action="store_true", help="Delete dupes instead of moving")
    ap.add_argument("--dry-run", action="store_true", help="Only report, change nothing")
    args = ap.parse_args()

    targets = collect_wavs(args.new_dir, prefix=args.prefix)
    if not targets:
        print(f"[INFO] no clips with prefix '{args.prefix}' under {args.new_dir}")
        return
    # Reference = EVERYTHING already in the dataset minus the target files
    # themselves (by resolved path). This compares the new clips against the whole
    # existing corpus — including clips of the SAME prefix moved in earlier runs —
    # while never letting a target match itself.
    target_paths = {p.resolve() for p in targets}
    refs = [w for w in collect_wavs(args.existing_dir) if w.resolve() not in target_paths]

    print(f"Fingerprinting {len(refs)} existing clips (this is the slow part) ...")
    ref_fps: list[np.ndarray] = []
    ref_durs: list[float] = []
    ref_paths: list[Path] = []
    for p in refs:
        fp, dur = fingerprint(p)
        if fp is not None:
            ref_fps.append(fp)
            ref_durs.append(dur)
            ref_paths.append(p)
    ref_mat = np.stack(ref_fps) if ref_fps else np.zeros((0, N_MELS * N_FRAMES), np.float32)
    durs = np.array(ref_durs, dtype=np.float32)

    print(f"Checking {len(targets)} new clips (prefix '{args.prefix}') ...")
    n_dup, n_keep = 0, 0
    report: list[tuple[Path, Path, float]] = []
    for p in targets:
        fp, dur = fingerprint(p)
        if fp is None:
            continue
        matched: tuple[Path, float] | None = None
        if len(ref_mat):
            sims = ref_mat @ fp
            j = int(np.argmax(sims))
            if sims[j] >= args.threshold and durs[j] > 0 and \
               abs(dur - durs[j]) / max(dur, durs[j]) <= args.dur_tol:
                matched = (ref_paths[j], float(sims[j]))

        if matched is not None:
            n_dup += 1
            report.append((p, matched[0], matched[1]))
            if not args.dry_run:
                if args.delete:
                    p.unlink(missing_ok=True)
                else:  # default: move (non-destructive)
                    dest = Path(args.dupes_dir) / p.parent.name
                    dest.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(p), str(dest / p.name))
        else:
            n_keep += 1
            # Add to the reference so later targets dedup against this one too.
            ref_mat = np.vstack([ref_mat, fp[None, :]]) if len(ref_mat) else fp[None, :]
            durs = np.append(durs, dur)
            ref_paths.append(p)

    action = "would remove" if args.dry_run else ("deleted" if args.delete else f"moved to {args.dupes_dir}")
    print("\n" + "=" * 60)
    print("DEDUP" + (" (DRY-RUN)" if args.dry_run else "") + " COMPLETE")
    print(f"  duplicates: {n_dup} ({action})   kept (genuinely new): {n_keep}")
    if report:
        print("\n  sample matches  (new  <=  existing  cosine):")
        for p, m, s in report[:20]:
            print(f"    {p.name}  <=  {m.name}  ({s:.3f})")
    print("=" * 60)


if __name__ == "__main__":
    main()
