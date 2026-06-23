"""Download strongly-labeled AudioSet segments for specific cat classes.

Uses the official AudioSet *strong* (temporal) labels: each row is
  segment_id <tab> start_time_seconds <tab> end_time_seconds <tab> MID
where segment_id = "<YTID>_<clip_start_ms>" and the times are RELATIVE to the
10-second clip (0..10). We filter by verified MIDs, then use yt-dlp + ffmpeg to
download ONLY the labeled segment, resample to mono 16 kHz, and write it into
data/processed/<class>/ as  as_<YTID>__<8hex>.wav  (YTID = cat_id, one source
per video, consistent with the rest of the pipeline).

VERIFIED MIDs (from the official strong mid_to_display_name.tsv):
  Caterwaul /m/07r81j2  (yowling of a cat in heat) -> llamada_apareamiento
  Hiss      /m/07rjwbb                              -> advertencia
  Growling  /m/0ghcn6                               -> enfadado
  Meow      /m/07qrkrw                              -> atencion
  Purr      /m/02yds9                               -> descansando
  (Caza/trinos/llamada_madre have NO AudioSet class.)

Requires yt-dlp and ffmpeg on PATH. Many YouTube videos are gone/private
(~30-50% will fail) — that's normal. This is for research use; respect each
video's rights.

Usage (PowerShell):
  .\.venv\Scripts\python.exe scripts/fetch_audioset_strong.py --classes llamada_apareamiento --max-per-class 300
  # then re-extract + retrain.
"""

from __future__ import annotations

import argparse
import subprocess
import uuid
from pathlib import Path

import numpy as np
import requests
import soundfile as sf

try:
    import librosa
except ImportError as e:  # pragma: no cover
    raise SystemExit("librosa required: pip install librosa") from e

SR = 16000
STRONG_BASE = "http://storage.googleapis.com/us_audioset/youtube_corpus/strong"
TSV = {
    "train": f"{STRONG_BASE}/audioset_train_strong.tsv",
    "eval": f"{STRONG_BASE}/audioset_eval_strong.tsv",
}
CLASS_TO_MID = {
    "llamada_apareamiento": "/m/07r81j2",  # Caterwaul
    "advertencia": "/m/07rjwbb",            # Hiss
    "enfadado": "/m/0ghcn6",                # Growling
    "atencion": "/m/07qrkrw",               # Meow
    "descansando": "/m/02yds9",             # Purr
}


def get_tsv(split: str, cache_dir: Path) -> Path:
    cache_dir.mkdir(parents=True, exist_ok=True)
    dst = cache_dir / f"audioset_{split}_strong.tsv"
    if dst.exists() and dst.stat().st_size > 1000:
        return dst
    print(f"[INFO] downloading {split} strong labels...")
    r = requests.get(TSV[split], timeout=120)
    r.raise_for_status()
    dst.write_bytes(r.content)
    return dst


def parse_segments(tsv_path: Path, mid: str):
    """Return {segment_id: (ytid, clip_start_s, ev_start, ev_end)} for rows with mid."""
    segs: dict[str, tuple] = {}
    with open(tsv_path, encoding="utf-8") as f:
        next(f, None)  # header
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) != 4 or parts[3] != mid:
                continue
            seg_id, s, e, _ = parts
            ytid, ms = seg_id.rsplit("_", 1)
            clip_start = int(ms) / 1000.0
            s, e = float(s), float(e)
            if seg_id in segs:
                _, cs, os_, oe = segs[seg_id]
                segs[seg_id] = (ytid, cs, min(os_, s), max(oe, e))
            else:
                segs[seg_id] = (ytid, clip_start, s, e)
    return segs


def download_segment(ytid: str, a: float, b: float, tmp: Path) -> bool:
    cmd = [
        "yt-dlp", "--quiet", "--no-warnings", "--no-playlist", "-f", "bestaudio",
        "--download-sections", f"*{a:.2f}-{b:.2f}", "--force-keyframes-at-cuts",
        "-x", "--audio-format", "wav", "--audio-quality", "0",
        "-o", str(tmp), f"https://www.youtube.com/watch?v={ytid}",
    ]
    try:
        subprocess.run(cmd, check=True, timeout=120,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return tmp.exists()
    except Exception:
        return False


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--classes", nargs="+", required=True, choices=list(CLASS_TO_MID))
    ap.add_argument("--splits", nargs="+", default=["train", "eval"], choices=["train", "eval"])
    ap.add_argument("--max-per-class", type=int, default=300)
    ap.add_argument("--pad", type=float, default=0.3, help="seconds of padding around the event")
    ap.add_argument("--out", type=Path, default=Path("data/processed"))
    ap.add_argument("--cache", type=Path, default=Path("data/raw/audioset_strong"))
    ap.add_argument("--co-mid", default=None,
                    help="Require this additional MID to co-occur in the same segment "
                         "(e.g. /m/01yrx for Cat, to filter non-feline Growling).")
    args = ap.parse_args()

    for cname in args.classes:
        mid = CLASS_TO_MID[cname]
        out_dir = args.out / cname
        out_dir.mkdir(parents=True, exist_ok=True)
        segs: dict[str, tuple] = {}
        for sp in args.splits:
            tsv = get_tsv(sp, args.cache)
            primary = parse_segments(tsv, mid)
            if args.co_mid:
                co = parse_segments(tsv, args.co_mid)
                primary = {k: v for k, v in primary.items() if k in co}
            segs.update(primary)
        n_co = f" (co-occurrence with {args.co_mid} applied)" if args.co_mid else ""
        print(f"\n=== {cname} ({mid}): {len(segs)} labeled segments found{n_co} ===")
        written = tried = fails = 0
        for seg_id, (ytid, clip_start, ev_s, ev_e) in segs.items():
            if written >= args.max_per_class:
                break
            tried += 1
            a = max(0.0, clip_start + ev_s - args.pad)
            b = clip_start + ev_e + args.pad
            tmp = out_dir / f"_tmp_{uuid.uuid4().hex[:8]}.wav"
            ok = download_segment(ytid, a, b, tmp)
            if not ok:
                fails += 1
                continue
            try:
                pcm, sr = sf.read(str(tmp), dtype="float32")
                if pcm.ndim > 1:
                    pcm = pcm.mean(axis=1)
                if sr != SR:
                    pcm = librosa.resample(pcm, orig_sr=sr, target_sr=SR)
                if len(pcm) < int(0.2 * SR) or np.max(np.abs(pcm)) < 1e-6:
                    continue
                yt_clean = ytid.replace("__", "_")
                name = f"as_{yt_clean}__{uuid.uuid4().hex[:8]}.wav"
                sf.write(str(out_dir / name), pcm.astype(np.float32), SR)
                written += 1
                if written % 25 == 0:
                    print(f"  {written} ok / {tried} tried ({fails} failed)")
            except Exception:
                fails += 1
            finally:
                if tmp.exists():
                    tmp.unlink()
        print(f"  -> wrote {written} clips to {out_dir}  ({fails} downloads failed)")

    print("\n[DONE] Re-extract + retrain. For llamada_apareamiento, consider removing "
          "the old heterogeneous VGGSound caterwauling clips so the clean AudioSet "
          "Caterwaul replaces them.")


if __name__ == "__main__":
    main()
