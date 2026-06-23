"""
Generic folder ingestor for downloaded open datasets.

Takes ANY folder of audio files, resamples to 16 kHz mono, splits long
recordings into individual call-clips (silence-based), peak-normalizes, and
writes them to data/quarantine/<class>/ — ready for dedup + manual review +
move, exactly like the YouTube/Freesound paths.

cat_id grouping (critical for StratifiedGroupKFold): each SOURCE FILE becomes one
group; all segments of the same file share its cat_id, so a single cat's
recording is never split across train/val. Filenames are
  <dataset>_<filestem>_seg<N>__<hash8>.wav
and parse_cat_id() reads "<dataset>_<filestem>" (it strips the _segN suffix and
the 8-hex hash).

Examples (after you verify each link + license):
  # Volodin "Spring Calls of Domestic Cats" -> mating (long files, segment them)
  python scripts/ingest_folder.py --src downloads/spring_calls --class llamada_apareamiento --dataset springcalls
  # Dogs-vs-Cats: AFTER you move ONLY the cat files into a folder
  python scripts/ingest_folder.py --src downloads/dvc_cats_meow --class atencion --dataset dvc
  # already-short clips: skip segmentation
  python scripts/ingest_folder.py --src downloads/foo --class dolor --dataset foo --no-segment
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path

import numpy as np

try:
    import librosa
    import soundfile as sf
except ImportError as e:
    raise SystemExit(f"librosa and soundfile required: pip install librosa soundfile\n{e}") from e

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SR = 16000
MIN_DUR_S = 0.40
MAX_DUR_S = 10.0
TRIM_TOP_DB = 30
QUARANTINE = Path("data/quarantine")
AUDIO_EXT = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".wma", ".aif", ".aiff", ".opus"}


def safe_token(text: str) -> str:
    """Filename-safe, single-underscore token (never contains '__')."""
    token = re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_")
    return (re.sub(r"_+", "_", token)[:40]) or "x"


def split_calls(y: np.ndarray) -> list[np.ndarray]:
    """Non-silent intervals, each capped to MAX_DUR_S (long files → many clips)."""
    try:
        intervals = librosa.effects.split(y, top_db=TRIM_TOP_DB)
    except Exception:
        intervals = np.array([[0, len(y)]])
    step = int(MAX_DUR_S * SR)
    out: list[np.ndarray] = []
    for start, end in intervals:
        seg = y[start:end]
        if len(seg) / SR < MIN_DUR_S:
            continue
        for i in range(0, len(seg), step):
            chunk = seg[i : i + step]
            if len(chunk) / SR >= MIN_DUR_S:
                out.append(chunk)
    return out


def process_file(src: Path, dst_dir: Path, dataset: str, segment: bool) -> int:
    try:
        y, _ = librosa.load(str(src), sr=SR, mono=True)
    except Exception as e:
        print(f"  [WARN] load failed {src.name}: {e}")
        return 0

    if segment:
        chunks = split_calls(y)
    else:
        try:
            y_trim, _ = librosa.effects.trim(y, top_db=TRIM_TOP_DB)
        except Exception:
            y_trim = y
        chunks = [y_trim[: int(MAX_DUR_S * SR)]] if len(y_trim) / SR >= MIN_DUR_S else []

    base = f"{safe_token(dataset)}_{safe_token(src.stem)}"  # → the cat_id group
    written = 0
    for i, chunk in enumerate(chunks):
        peak = float(np.abs(chunk).max())
        if peak < 1e-6:
            continue
        norm = (chunk / peak * 0.9).astype(np.float32)
        h = hashlib.md5(f"{src}:{i}".encode("utf-8")).hexdigest()[:8]
        dst_dir.mkdir(parents=True, exist_ok=True)
        sf.write(str(dst_dir / f"{base}_seg{i}__{h}.wav"), norm, SR, subtype="PCM_16")
        written += 1
    return written


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest a folder of audio into quarantine")
    ap.add_argument("--src", required=True, help="Source folder with audio files (searched recursively)")
    ap.add_argument("--class", dest="cls", required=True, help="Target class (e.g. llamada_apareamiento)")
    ap.add_argument("--dataset", required=True, help="Short dataset tag → cat_id prefix (e.g. springcalls)")
    ap.add_argument("--out", default=str(QUARANTINE))
    ap.add_argument("--no-segment", action="store_true", help="Do not split long files into call-clips")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    src_root = Path(args.src)
    if not src_root.exists():
        print(f"[ERROR] source not found: {src_root.resolve()}")
        sys.exit(1)

    files = sorted(p for p in src_root.rglob("*") if p.suffix.lower() in AUDIO_EXT)
    if not files:
        print(f"[ERROR] no audio files under {src_root.resolve()}")
        sys.exit(1)

    dst_dir = Path(args.out) / args.cls
    print(f"Ingesting {len(files)} files → {dst_dir}  (segment={not args.no_segment})")
    total = 0
    for f in files:
        if args.dry_run:
            continue
        n = process_file(f, dst_dir, args.dataset, segment=not args.no_segment)
        total += n
        if n:
            print(f"  {f.name} → {n} clip(s)")

    print("\n" + "=" * 60)
    print(f"DONE{' (DRY-RUN)' if args.dry_run else ''}: {len(files)} files → {total} clips in {dst_dir}")
    print("NEXT: dedup, then QC + review + move, e.g.")
    print(f"  python scripts/dedup_against_existing.py --prefix {safe_token(args.dataset)}_ --move")
    print(f"  python scripts/qc_audio.py --dirs data/quarantine --move")
    print("=" * 60)


if __name__ == "__main__":
    main()
