"""
Download cat sounds into quarantine for manual review.

Source: YouTube via yt-dlp (no API key required).
Output: training/data/quarantine/<class>/yt_<uploader_id>__<video_id>.wav

Naming convention gives cat_id diversity:
  Different uploader_id = different cat_id for StratifiedGroupKFold

After review:
  GOOD clips -> copy to training/data/processed_clean/<class>/
  BAD clips  -> delete from quarantine

Usage:
  python scripts/fetch_quarantine.py
  python scripts/fetch_quarantine.py --classes enfadado advertencia
  python scripts/fetch_quarantine.py --classes enfadado --max-per-query 5
"""

from __future__ import annotations

import argparse
import hashlib
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

try:
    import librosa
    import soundfile as sf
except ImportError as e:
    raise SystemExit(f"librosa and soundfile required: pip install librosa soundfile\n{e}") from e

# ── CONFIG ────────────────────────────────────────────────────────────────────

QUARANTINE = Path("data/quarantine")
SR = 16000
HIGHPASS_HZ = 100.0
MAX_DURATION_S = 10.0   # clips longer than this get trimmed to first 10s
MIN_DURATION_S = 0.8    # discard very short clips

DEFAULT_MAX_PER_QUERY = 8

# ── SEARCH QUERIES PER CLASS ──────────────────────────────────────────────────

QUERIES: dict[str, list[str]] = {
    "enfadado": [
        "cat growling angry sound",
        "angry cat growling hissing",
        "cat low growl warning vocalization",
        "domestic cat growling",
        "cat snarl growl close up",
        "cat growling defensive sound",
    ],
    "advertencia": [
        "cat hissing sound single",
        "cat hissing spitting defensive",
        "cat warning hiss close up",
        "domestic cat hissing vocalization",
        "scared cat hissing",
        "cat spitting hiss sound",
    ],
    "pelea": [
        "cats fighting sounds real",
        "two cats fighting vocalization",
        "cat fight yowl scream",
        "cat aggressive fight sounds",
    ],
    "llamada_madre": [
        "mother cat calling kittens sound",
        "mama cat meowing kittens",
        "queen cat calling kittens",
        "cat mom calling kitten vocalization",
    ],
    "trinos": [
        "cat chirping birds window",
        "cat chattering prey hunting",
        "cat trilling sound greeting",
        "cat trill vocalization",
        "cat ekekek chattering",
    ],
    # Maullido de demanda/atención: insistente, repetitivo, F0 ascendente.
    # atencion es el suelo del modelo (F1 0.25): 74 originales, 0 NAYA.
    "atencion": [
        "cat meowing for food hungry",
        "cat demanding food meow insistent",
        "hungry cat meowing loudly feed me",
        "cat begging for food meowing",
        "cat meowing for attention owner",
        "cat wants to be fed meowing",
        "demanding cat loud meow repetitive",
        "cat meowing waiting for food",
    ],
    # Apareamiento: caterwaul sostenido y rítmico (celo). Par confuso con dolor,
    # pero el celo es PROLONGADO/repetitivo (no ráfagas abruptas).
    "llamada_apareamiento": [
        "cat in heat female calling sound",
        "cat caterwauling at night",
        "female cat in heat yowling",
        "tomcat mating call sound",
        "cat heat season loud yowl",
        "cats mating calls vocalization",
    ],
    # Feliz/contento: ronroneo, trino suave, maullido relajado (F0 plano).
    # Par confuso con atencion (demanda ascendente): aquí buscamos lo CONTENTO.
    "feliz_contento": [
        "cat purring loudly close up",
        "happy cat trill chirp prrt",
        "content cat purring sound",
        "cat greeting trill happy",
        "relaxed cat purr meow",
        "kitten purring contentment",
    ],
    # Dolor: agudo, abrupto, distrés (inicio súbito, ráfagas cortas).
    # Par confuso con apareamiento: aquí buscamos lo ABRUPTO/distrés, no el celo.
    "dolor": [
        "cat in pain crying sound",
        "cat screaming in pain hurt",
        "injured cat distress meow",
        "cat painful yowl at vet",
        "cat yelp pain sudden",
        "distressed cat crying loudly",
    ],
}

# ── AUDIO PROCESSING ──────────────────────────────────────────────────────────

def highpass(y: np.ndarray, sr: int, cutoff: float = HIGHPASS_HZ) -> np.ndarray:
    from scipy.signal import butter, filtfilt
    nyq = sr / 2
    b, a = butter(5, cutoff / nyq, btype="high")
    return filtfilt(b, a, y).astype(np.float32)


def process_wav(src: Path) -> bool:
    """Resample to 16kHz mono, highpass, trim silence, cap at MAX_DURATION_S. In-place."""
    try:
        y, _ = librosa.load(str(src), sr=SR, mono=True, duration=MAX_DURATION_S)
    except Exception as e:
        print(f"    [WARN] load failed: {e}")
        return False

    if len(y) / SR < MIN_DURATION_S:
        print(f"    [SKIP] too short ({len(y)/SR:.1f}s)")
        return False

    y_trim, _ = librosa.effects.trim(y, top_db=30)
    if len(y_trim) / SR < MIN_DURATION_S:
        print(f"    [SKIP] silent after trim ({len(y_trim)/SR:.1f}s)")
        return False

    y_hp = highpass(y_trim, SR)
    peak = np.abs(y_hp).max()
    if peak < 1e-6:
        print(f"    [SKIP] silent after highpass")
        return False
    y_hp = (y_hp / peak * 0.9).astype(np.float32)

    sf.write(str(src), y_hp, SR, subtype="PCM_16")
    return True

# ── DOWNLOAD ──────────────────────────────────────────────────────────────────

def download_query(query: str, out_dir: Path, max_results: int) -> int:
    """Search YouTube, download audio to out_dir. Returns count of new files."""
    before = set(out_dir.glob("yt_*.wav"))

    out_tmpl = str(out_dir / "yt_%(uploader_id)s__%(id)s.%(ext)s")
    cmd = [
        "yt-dlp",
        f"ytsearch{max_results}:{query}",
        "--extract-audio",
        "--audio-format", "wav",
        "--audio-quality", "0",
        "--no-playlist",
        "--ignore-errors",
        "--match-filter", "duration <= 120",
        "--postprocessor-args", "ffmpeg:-ac 1 -ar 16000",
        "--output", out_tmpl,
        "--no-update",
        "--progress",
    ]

    try:
        subprocess.run(cmd, timeout=300, check=False)
    except subprocess.TimeoutExpired:
        print(f"    [WARN] yt-dlp timed out for: {query!r}")
    except Exception as e:
        print(f"    [WARN] yt-dlp error: {e}")

    after = set(out_dir.glob("yt_*.wav"))
    new_files = after - before

    kept = 0
    for wav in sorted(new_files):
        print(f"    Processing: {wav.name}")
        if process_wav(wav):
            dur = len(librosa.load(str(wav), sr=SR, mono=True)[0]) / SR
            print(f"      OK ({dur:.1f}s)")
            kept += 1
        else:
            wav.unlink(missing_ok=True)
            print(f"      -> deleted (too short/silent)")

    time.sleep(2)
    return kept

# ── MAIN ──────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--classes", nargs="*", default=list(QUERIES.keys()))
    ap.add_argument("--max-per-query", type=int, default=DEFAULT_MAX_PER_QUERY)
    args = ap.parse_args()

    classes = [c for c in args.classes if c in QUERIES]
    if not classes:
        print(f"[ERROR] Valid classes: {list(QUERIES.keys())}")
        sys.exit(1)

    grand_total = 0
    for cls in classes:
        out_dir = QUARANTINE / cls
        out_dir.mkdir(parents=True, exist_ok=True)
        existing = len(list(out_dir.glob("*.wav")))
        print(f"\n{'='*60}")
        print(f"CLASS: {cls}  (existing in quarantine: {existing})")
        print(f"{'='*60}")

        cls_total = 0
        for i, query in enumerate(QUERIES[cls], 1):
            print(f"\n  [{i}/{len(QUERIES[cls])}] {query!r}")
            n = download_query(query, out_dir, args.max_per_query)
            cls_total += n
            print(f"  -> {n} new clips kept")

        final = len(list(out_dir.glob("*.wav")))
        print(f"\n[{cls}] New this run: {cls_total} | Total in quarantine: {final}")
        grand_total += cls_total

    print(f"\n{'='*60}")
    print(f"DONE. Total new clips downloaded: {grand_total}")
    print(f"Review in: {QUARANTINE.resolve()}")
    print(f"Approved -> copy to training/data/processed_clean/<class>/")

if __name__ == "__main__":
    main()
