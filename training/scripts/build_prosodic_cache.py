"""Precompute prosodic features for ALL wavs in parallel.

pyin (el extractor de F0) cuesta ~300 ms/archivo en un solo hilo: para ~14.5k
archivos serían ~75 min. Con multiprocessing sobre los 22 hilos del i7 Ultra
155H baja a ~5-8 min. Este script construye una caché path->vector que
`yamnet_pipeline.extract` lee directamente (evitando recalcular pyin durante la
extracción YAMNet, que es de por sí rápida).

La caché se invalida sola: guarda la lista de paths; si el set de wavs cambia,
`extract` recalcula los que falten en caché (fallback robusto).

Salida: data/prosodic_cache.npz  (paths[N], feats[N, PROSODIC_DIM])

Usage:
  python scripts/build_prosodic_cache.py
  python scripts/build_prosodic_cache.py --workers 20 --data data/processed_clean
"""

from __future__ import annotations

import os

# CRÍTICO: limitar los hilos de BLAS/numpy a 1 ANTES de importar numpy. Cada
# worker es un proceso aparte; si numpy abre 22 hilos por worker, 20 workers =
# 440 hilos sobre 22 núcleos -> contención brutal (la 1ª versión tardó 42 min en
# vez de ~6). Con 1 hilo/worker la paralelización es casi lineal.
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS",
           "NUMEXPR_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"):
    os.environ.setdefault(_v, "1")

import argparse
import multiprocessing as mp
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

CACHE_PATH = Path("data/prosodic_cache.npz")
SR = 16000


HIGHPASS_HZ = 100.0


def _preprocess(pcm: np.ndarray, sr: int) -> np.ndarray:
    """Match yamnet_pipeline.extract preprocessing EXCEPT the min-len padding
    (padding would corrupt duration/RMS prosodic features)."""
    if pcm.ndim > 1:
        pcm = pcm.mean(axis=1)
    if sr != SR:
        import librosa
        pcm = librosa.resample(pcm, orig_sr=sr, target_sr=SR)
    pcm = pcm - np.mean(pcm)
    if len(pcm) > 15:
        from scipy.signal import butter, filtfilt
        b, a = butter(5, HIGHPASS_HZ / (SR / 2), btype="high")
        pcm = filtfilt(b, a, pcm)
    peak = np.max(np.abs(pcm))
    if peak > 1e-6:
        pcm = pcm / peak
    return pcm.astype(np.float32)


def _one(path_str: str) -> tuple[str, np.ndarray] | None:
    """Worker: compute prosodic vector for one wav. Returns (path, vec)."""
    # Import inside the worker so each process initializes librosa independently.
    from meowdecoder_training.prosodic_features import extract_prosodic, PROSODIC_DIM
    try:
        pcm, sr = sf.read(path_str, dtype="float32")
        vec = extract_prosodic(_preprocess(pcm, sr), SR)
    except Exception:
        vec = np.zeros(PROSODIC_DIM, dtype=np.float32)
    return path_str, vec


def main() -> None:
    ap = argparse.ArgumentParser(description="Parallel prosodic feature cache builder")
    ap.add_argument("--data", default="data/processed_clean")
    ap.add_argument("--out", default=str(CACHE_PATH))
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 8) - 2))
    ap.add_argument("--chunksize", type=int, default=16)
    args = ap.parse_args()

    data_dir = Path(args.data)
    wavs = sorted(str(p) for p in data_dir.rglob("*.wav"))
    if not wavs:
        raise SystemExit(f"No wavs under {data_dir}")
    print(f"[INFO] {len(wavs)} wavs  workers={args.workers}")

    t0 = time.time()
    paths: list[str] = []
    feats: list[np.ndarray] = []
    done = 0
    with mp.Pool(processes=args.workers) as pool:
        for path_str, vec in pool.imap_unordered(_one, wavs, chunksize=args.chunksize):
            paths.append(path_str)
            feats.append(vec)
            done += 1
            if done % 1000 == 0:
                rate = done / (time.time() - t0)
                eta = (len(wavs) - done) / max(rate, 1e-6) / 60.0
                print(f"  {done}/{len(wavs)}  ({rate:.0f}/s, ETA {eta:.1f} min)")

    feats_arr = np.stack(feats).astype(np.float32)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(args.out,
                        paths=np.array(paths, dtype=object),
                        feats=feats_arr)
    dt = (time.time() - t0) / 60.0
    print(f"[OK] cached {len(paths)} prosodic vectors -> {args.out}  ({dt:.1f} min)")


if __name__ == "__main__":
    main()
