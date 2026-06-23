"""
Semantic audio QC using YAMNet embeddings — última criba CONSERVADORA.

Complementa las cribas anteriores:
  qc_audio.py  -> contaminación (voz/música)
  qc_final.py  -> defectos de señal (silencio/clipping)
  qc_semantic  -> AQUÍ: archivos probablemente MAL ETIQUETADOS o atípicos.

Filosofía: las clases de sonidos de gato se solapan mucho en el espacio YAMNet
(similitud coseno 0.7-0.8 incluso entre clases distintas). Un detector ingenuo
de "centroide más cercano" marca como sospechoso el solapamiento NATURAL de
clases bien etiquetadas. Para evitar eso, solo marcamos cuando hay señal FUERTE:

  CONFUSED : otra clase es más cercana a su centroide POR UN MARGEN real
             (best_other - own >= --margin, default 0.06).
             -> candidato fuerte a mala etiqueta.
  OUTLIER  : similitud con su propio centroide < mean - N*std (default N=3.0).
             -> grabación atípica / ruido extraño.

Notas de diseño:
  - SOLO se evalúan y mueven archivos ORIGINALES (sin "__aug" en el nombre).
    Las copias aumentadas comparten cat_id pero tienen UUID nuevo, así que NO
    se pueden mapear a su original concreto. Se regeneran tras limpiar.
  - Los centroides se calculan SOLO con originales (las aug inflarían y sesgarían).
  - Embeddings se cachean en data/qc_semantic_cache.npz para iterar umbrales
    sin recalcular (la extracción YAMNet es lo único lento).
  - DRY-RUN por defecto. Requiere --move explícito para relocalizar.

Output: quarantine/finalv2/<class>/
Report: quarantine/finalv2/SEMANTIC_QC_REPORT.txt

Usage:
  python scripts/qc_semantic.py                    # dry-run con cache
  python scripts/qc_semantic.py --margin 0.08      # más estricto (menos flags)
  python scripts/qc_semantic.py --outlier-std 2.5  # más agresivo en outliers
  python scripts/qc_semantic.py --move             # mover tras revisar el dry-run
  python scripts/qc_semantic.py --rebuild-cache    # forzar re-extracción
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import soundfile as sf

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# ── CONFIG ────────────────────────────────────────────────────────────────────

PROCESSED_DIR = Path("data/processed_clean")
OUT_DIR       = Path("quarantine/finalv2")
CACHE_PATH    = Path("data/qc_semantic_cache.npz")

SR          = 16000
HIGHPASS_HZ = 100.0

DEFAULT_MARGIN      = 0.06   # CONFUSED: best_other_sim - own_sim >= margin
DEFAULT_OUTLIER_STD = 3.0    # OUTLIER : own_sim < mean - N*std

YAMNET_URL = "https://tfhub.dev/google/yamnet/1"


# ── AUDIO + EMBEDDING ─────────────────────────────────────────────────────────

def _highpass(pcm: np.ndarray, cutoff: float, sr: int) -> np.ndarray:
    from scipy.signal import butter, filtfilt
    nyq = sr / 2
    b, a = butter(5, cutoff / nyq, btype="high")
    return filtfilt(b, a, pcm).astype(np.float32)


def extract_embedding(yamnet, wav_path: Path) -> np.ndarray | None:
    """Mean YAMNet embedding (1024-dim), same preprocessing as the pipeline."""
    try:
        pcm, sr_file = sf.read(str(wav_path), dtype="float32")
    except Exception as e:
        print(f"  [ERR] {wav_path.name}: {e}")
        return None
    if pcm.ndim > 1:
        pcm = pcm.mean(axis=1)
    if sr_file != SR:
        try:
            import librosa
            pcm = librosa.resample(pcm, orig_sr=sr_file, target_sr=SR)
        except Exception:
            return None
    pcm = pcm - pcm.mean()
    if len(pcm) > 15:
        pcm = _highpass(pcm, HIGHPASS_HZ, SR)
    peak = float(np.abs(pcm).max())
    if peak < 1e-6:
        return None
    pcm = (pcm / peak).astype(np.float32)
    min_len = int(0.96 * SR)
    if len(pcm) < min_len:
        pad = np.zeros(min_len, dtype=np.float32)
        pad[: len(pcm)] = pcm
        pcm = pad

    import tensorflow as tf
    _, emb, _ = yamnet(tf.convert_to_tensor(pcm, dtype=tf.float32))
    return emb.numpy().mean(axis=0).astype(np.float32)  # (1024,)


def _l2norm(v: np.ndarray) -> np.ndarray:
    return v / (np.linalg.norm(v) + 1e-8)


# ── CACHE ─────────────────────────────────────────────────────────────────────

def build_or_load_cache(data_dir: Path, cache_path: Path, rebuild: bool):
    """Return (paths[list[str]], classes[list[str]], embs[N,1024], is_aug[N]).

    Only ORIGINAL files are embedded (aug skipped). Cache is keyed on the set of
    original paths; if the directory's originals changed, the cache is rebuilt.
    """
    class_dirs = [d for d in sorted(data_dir.iterdir()) if d.is_dir()]
    cur_paths: list[str] = []
    cur_cls:   list[str] = []
    for d in class_dirs:
        for w in sorted(d.glob("*.wav")):
            if "__aug" in w.name:
                continue
            cur_paths.append(str(w))
            cur_cls.append(d.name)

    if cache_path.exists() and not rebuild:
        z = np.load(cache_path, allow_pickle=True)
        cached_paths = list(z["paths"])
        if cached_paths == cur_paths:
            print(f"[CACHE] Loaded {len(cached_paths)} embeddings from {cache_path}")
            return cached_paths, list(z["cls"]), z["embs"], None
        print("[CACHE] Stale (originals changed) -> rebuilding...")

    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
    os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
    import tensorflow_hub as hub
    print("[INFO] Loading YAMNet (cached weights)...")
    yamnet = hub.load(YAMNET_URL)
    print(f"[INFO] Extracting embeddings for {len(cur_paths)} originals...\n")

    paths_ok, cls_ok, embs = [], [], []
    per_cls_count: dict[str, int] = defaultdict(int)
    for p, c in zip(cur_paths, cur_cls):
        emb = extract_embedding(yamnet, Path(p))
        if emb is None:
            continue
        paths_ok.append(p)
        cls_ok.append(c)
        embs.append(emb)
        per_cls_count[c] += 1
    for c in sorted(per_cls_count):
        print(f"  {c}: {per_cls_count[c]} originals embedded")

    embs_arr = np.stack(embs).astype(np.float32)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(cache_path,
                        paths=np.array(paths_ok, dtype=object),
                        cls=np.array(cls_ok, dtype=object),
                        embs=embs_arr)
    print(f"\n[CACHE] Saved {len(paths_ok)} embeddings -> {cache_path}")
    return paths_ok, cls_ok, embs_arr, None


# ── MAIN ──────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description="Conservative semantic QC (YAMNet centroids)")
    ap.add_argument("--data", default=str(PROCESSED_DIR))
    ap.add_argument("--out", default=str(OUT_DIR))
    ap.add_argument("--cache", default=str(CACHE_PATH))
    ap.add_argument("--margin", type=float, default=DEFAULT_MARGIN,
                    help=f"CONFUSED: best_other_sim - own_sim >= this (default {DEFAULT_MARGIN})")
    ap.add_argument("--outlier-std", type=float, default=DEFAULT_OUTLIER_STD,
                    help=f"OUTLIER: own_sim < mean - N*std (default {DEFAULT_OUTLIER_STD})")
    ap.add_argument("--move", action="store_true",
                    help="Move flagged ORIGINALS (default: dry-run)")
    ap.add_argument("--rebuild-cache", action="store_true",
                    help="Force YAMNet re-extraction even if cache is valid")
    args = ap.parse_args()

    data_dir = Path(args.data)
    out_dir  = Path(args.out)
    cache_p  = Path(args.cache)

    paths, cls_list, embs, _ = build_or_load_cache(data_dir, cache_p, args.rebuild_cache)
    classes = sorted(set(cls_list))
    cls_arr = np.array(cls_list)

    # ── Centroids (originals only, already filtered) ──────────────────────────
    centroids: dict[str, np.ndarray] = {}
    for c in classes:
        mask = cls_arr == c
        ctr = embs[mask].mean(axis=0)
        centroids[c] = _l2norm(ctr)

    # Precompute normalized embeddings and full sim matrix (N x C)
    embs_n = embs / (np.linalg.norm(embs, axis=1, keepdims=True) + 1e-8)
    cls_order = classes
    C = np.stack([centroids[c] for c in cls_order])      # (C, 1024) already normed
    sim_mat = embs_n @ C.T                                 # (N, C) cosine sims

    own_idx = np.array([cls_order.index(c) for c in cls_list])
    own_sim = sim_mat[np.arange(len(paths)), own_idx]

    # Per-class outlier thresholds
    out_thr: dict[str, float] = {}
    print("\n[STATS] Per-class own-centroid similarity:")
    for c in classes:
        m = cls_arr == c
        mu, sd = float(own_sim[m].mean()), float(own_sim[m].std())
        out_thr[c] = mu - args.outlier_std * sd
        print(f"  {c:<22} mean={mu:.3f}  std={sd:.3f}  outlier_thr={out_thr[c]:.3f}")

    # ── Flagging ──────────────────────────────────────────────────────────────
    flagged: list[tuple[str, str, str, list[str]]] = []  # (cls, path, name, reasons)
    for i, (p, c) in enumerate(zip(paths, cls_list)):
        sims = sim_mat[i]
        o = own_sim[i]
        # best OTHER class
        other = sims.copy()
        other[own_idx[i]] = -1.0
        bj = int(other.argmax())
        best_other_cls = cls_order[bj]
        best_other = float(other[bj])

        reasons = []
        if best_other - o >= args.margin:
            reasons.append(
                f"CONFUSED  nearest={best_other_cls}  own={o:.3f}  "
                f"other={best_other:.3f}  margin={best_other - o:.3f}"
            )
        if o < out_thr[c]:
            reasons.append(f"OUTLIER  own={o:.3f} < thr={out_thr[c]:.3f}")

        if reasons:
            flagged.append((c, p, Path(p).name, reasons))

    # CONFUSED first (mislabels), then OUTLIER-only
    flagged.sort(key=lambda t: 0 if any("CONFUSED" in r for r in t[3]) else 1)

    # ── Report / move ─────────────────────────────────────────────────────────
    by_class: dict[str, int] = defaultdict(int)
    confused_n = sum(1 for f in flagged if any("CONFUSED" in r for r in f[3]))
    outlier_n  = sum(1 for f in flagged if any("OUTLIER" in r for r in f[3]))

    report_lines: list[str] = []
    moved = 0
    for c, p, name, reasons in flagged:
        by_class[c] += 1
        block = f"[{c}] {name}\n" + "\n".join(f"     {r}" for r in reasons)
        report_lines.append(block)
        if args.move:
            dst = out_dir / c
            dst.mkdir(parents=True, exist_ok=True)
            src = Path(p)
            if src.exists():
                shutil.move(str(src), str(dst / src.name))
                moved += 1

    total_orig = len(paths)
    pct = 100.0 * len(flagged) / max(1, total_orig)

    print(f"\n{'='*60}")
    print("SEMANTIC QC SUMMARY (conservative)")
    print(f"  margin={args.margin}  outlier_std={args.outlier_std}")
    print(f"  Originals scanned : {total_orig}")
    print(f"  Flagged           : {len(flagged)}  ({pct:.1f}%)")
    print(f"    CONFUSED        : {confused_n}")
    print(f"    OUTLIER         : {outlier_n}")
    print(f"  By class:")
    for c in sorted(by_class):
        print(f"    {c:<22}: {by_class[c]}")
    if args.move:
        print(f"  Moved             : {moved}  -> {out_dir}")
    else:
        print(f"  DRY-RUN: nothing moved. Add --move after reviewing.")
    print(f"{'='*60}")

    out_dir.mkdir(parents=True, exist_ok=True)
    rp = out_dir / "SEMANTIC_QC_REPORT.txt"
    with open(rp, "w", encoding="utf-8") as f:
        f.write(f"SEMANTIC QC (conservative)  margin={args.margin}  "
                f"outlier_std={args.outlier_std}\n")
        f.write(f"scanned={total_orig}  flagged={len(flagged)} ({pct:.1f}%)  "
                f"confused={confused_n}  outlier={outlier_n}  moved={moved}\n\n")
        f.write("Order: CONFUSED (likely mislabel) first, then OUTLIER-only.\n")
        f.write("NOTE: only ORIGINAL files listed/moved; aug copies regenerate after cleanup.\n\n")
        f.write("\n\n".join(report_lines))
    print(f"Report -> {rp.resolve()}")


if __name__ == "__main__":
    main()
