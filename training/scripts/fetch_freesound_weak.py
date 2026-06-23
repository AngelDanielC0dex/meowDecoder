"""Targeted Freesound downloader for MeowDecoder's weak classes.

Downloads HQ-OGG previews (public URLs; the API token only authorizes search +
metadata, so we use previews — good enough for YAMNet, which resamples to 16 kHz
anyway) for the classes AudioSet does not cover well: trinos, pelea,
llamada_madre (and optional hiss/growl/caterwaul). Each clip is decoded to mono
16 kHz WAV and written straight into data/processed/<class>/ as
  fs_<username>__<8hex>.wav
so the username acts as the cat_id proxy and the file slots into `extract`.

SECURITY: reads the key from the FREESOUND_API_KEY environment variable. Never
hard-code it. Rotate the key after use.

Setup (PowerShell):
  $env:FREESOUND_API_KEY = "YOUR_KEY"
  .\.venv\Scripts\python.exe scripts/fetch_freesound_weak.py --classes trinos pelea llamada_madre
  # then re-extract + retrain:
  .\.venv\Scripts\python.exe -m meowdecoder_training.yamnet_pipeline extract --config config.yaml
"""

from __future__ import annotations

import argparse
import os
import time
import uuid
from pathlib import Path

import numpy as np
import requests
import soundfile as sf

try:
    import librosa
except ImportError as e:  # pragma: no cover
    raise SystemExit("librosa required: pip install librosa") from e

BASE = "https://freesound.org/apiv2"

# Verified, class-specific queries (English; Freesound is English-indexed).
QUERIES = {
    "trinos": ["cat trill", "cat trilling", "cat chirp", "cat chirrup", "cat greeting trill",
               "cat chatter", "cat chattering", "cat chirping prey", "cat cackle", "cat ekekek"],
    "pelea": ["cats fighting", "cat fight", "cat screech fight", "cat yowl fight"],
    "llamada_madre": ["mother cat calling kittens", "queen cat calling", "cat calling kittens", "mama cat kittens"],
    "llamada_apareamiento": ["cat in heat", "cat caterwaul", "cat mating call", "cat howling"],
    "advertencia": ["cat hiss", "cat hissing", "angry cat hiss"],
    "enfadado": ["cat growl", "cat growling"],
}

SR = 16000


def search(token, query, page_size=80):
    params = {
        "query": query,
        "filter": "duration:[0.3 TO 8.0]",
        "fields": "id,username,previews,duration,license,name,tags",
        "page_size": page_size,
        "sort": "score",
        "token": token,
    }
    r = requests.get(f"{BASE}/search/text/", params=params, timeout=30)
    r.raise_for_status()
    return r.json().get("results", [])


def download_preview(url) -> bytes | None:
    for attempt in range(3):
        try:
            r = requests.get(url, timeout=30)
            if r.status_code == 200:
                return r.content
        except Exception:
            pass
        time.sleep(2 * (attempt + 1))  # backoff for 502/504
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--classes", nargs="+", required=True, choices=list(QUERIES))
    ap.add_argument("--max-per-class", type=int, default=400)
    ap.add_argument("--out", type=Path, default=Path("data/processed"))
    ap.add_argument("--sleep", type=float, default=1.2, help="seconds between requests (rate limit)")
    args = ap.parse_args()

    token = os.environ.get("FREESOUND_API_KEY")
    if not token:
        raise SystemExit("Set FREESOUND_API_KEY env var first (do not hard-code the key).")

    for cname in args.classes:
        out_dir = args.out / cname
        out_dir.mkdir(parents=True, exist_ok=True)
        seen_ids: set[int] = set()
        written = 0
        print(f"\n=== {cname} ===")
        for q in QUERIES[cname]:
            if written >= args.max_per_class:
                break
            try:
                results = search(token, q)
            except Exception as e:
                print(f"  [search fail] '{q}': {e}")
                time.sleep(args.sleep)
                continue
            print(f"  query '{q}': {len(results)} hits")
            for s in results:
                if written >= args.max_per_class:
                    break
                sid = s["id"]
                if sid in seen_ids:
                    continue
                seen_ids.add(sid)
                prev = (s.get("previews") or {}).get("preview-hq-ogg")
                if not prev:
                    continue
                time.sleep(args.sleep)
                blob = download_preview(prev)
                if not blob:
                    continue
                tmp = out_dir / f"_tmp_{sid}.ogg"
                try:
                    tmp.write_bytes(blob)
                    pcm, sr = sf.read(str(tmp), dtype="float32")
                    if pcm.ndim > 1:
                        pcm = pcm.mean(axis=1)
                    if sr != SR:
                        pcm = librosa.resample(pcm, orig_sr=sr, target_sr=SR)
                    peak = np.max(np.abs(pcm)) if len(pcm) else 0
                    if peak < 1e-6 or len(pcm) < int(0.2 * SR):
                        continue
                    user = "".join(c for c in str(s["username"]) if c.isalnum())[:24] or "anon"
                    name = f"fs_{user}__{uuid.uuid4().hex[:8]}.wav"
                    sf.write(str(out_dir / name), pcm.astype(np.float32), SR)
                    written += 1
                except Exception as e:
                    print(f"    [skip {sid}] {e}")
                finally:
                    if tmp.exists():
                        tmp.unlink()
        print(f"  -> wrote {written} clips to {out_dir}")

    print("\n[DONE] Next: run `extract` (frame_filter stays OFF) then the AudioSet "
          "speech filter (compute_audioset_scores.py + filter_by_audioset.py) to clean "
          "any human-voice clips that slipped in, then retrain + recalibrate.")


if __name__ == "__main__":
    main()
