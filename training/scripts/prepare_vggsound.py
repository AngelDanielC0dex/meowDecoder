"""Ingest VGG-Sound (cat/dog sounds) into the MeowDecoder processed layout.

VGG-Sound ships two CSVs (`train.csv`, `test.csv`) with columns:
  - file_id  : row index that names the WAV under audio_train/ or audio_test/
  - orig_idx : original VGG-Sound index (unused here, kept for traceability)
  - link     : YouTube video id (e.g. "-1GJQ3c94jQ")
  - time     : start second in the source YouTube video
  - label    : native class name, e.g. "cat purring", "dog barking"
  - split    : "train" or "test"

Both CSVs are processed; we do not honour their original split — our own
LOCO validation is the only protocol that matters here.

Why we use `link` (YouTube id) as `cat_id`
-----------------------------------------
LOCO is a leave-one-cat-out split, not a leave-one-clip-out. A YouTube
video typically contains several clips of the same cat, sometimes with
*different* labels across time stamps. Treating the YouTube id as
identity collapses all those clips into a single "cat" group, which is
exactly what we want: when LOCO holds out that group, the model has
truly never heard that source. This is the same fix that cured the
Freesound regex bug — never group heterogeneous clips under a generic
identity, never let the same source straddle train/val.

A 10s clip is split into `--window-s` windows (default 4s) so we get
~2-3 samples per source. Each window gets a unique UUID suffix, but
the same `cat_id`, so LOCO continues to be source-level.

Native label -> 11-class mapping
--------------------------------
  cat purring        -> descansando            (purr is the resting purr; see
                                                --purr-target to mirror it
                                                into feliz_contento)
  cat meowing        -> atencion
  cat growling       -> enfadado
  cat hissing        -> advertencia
  cat caterwauling   -> llamada_apareamiento

All `dog *` labels are dropped. Unknown labels are dropped with a
warning, never silently coerced (silently remapping would create
the same silent-label-noise problem we just fixed).

Output layout (matches yamnet_pipeline.extract_embeddings)
----------------------------------------------------------
  data/processed/<class>/<link>__<uuid8>.wav
  data/processed/<class>/<link>__seg1_<uuid8>.wav
  ...

Usage
-----
  .venv\\Scripts\\python.exe scripts\\prepare_vggsound.py ^
      --raw data\\raw\\VGGSound --out data\\processed
  .venv\\Scripts\\python.exe scripts\\prepare_vggsound.py ^
      --raw data\\raw\\VGGSound --out data\\processed ^
      --max-per-class 300 --window-s 4.0 --seed 42 --dry-run
"""
from __future__ import annotations

import argparse
import sys
import uuid
from pathlib import Path

import numpy as np
import pandas as pd
import soundfile as sf

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from scipy.signal import butter, filtfilt

TARGET_SR = 16_000
HIGHPASS_CUTOFF = 100.0
HIGHPASS_ORDER = 5
PEAK_TARGET = 0.891  # -1 dBFS, matches dataset.load_wav_mono16k convention
MIN_DURATION_S = 0.96
DEFAULT_WINDOW_S = 4.0

# Purr is acoustically the same in feliz_contento and descansando — that is
# the core ambiguity the heuristic DSP paper calls out. We default to
# descansando (resting purr) because YouTube "cat purring" videos are
# overwhelmingly cats lying down; users can pass --purr-target to mirror
# the same clips into the other class to enrich it (the same audio
# appearing under both labels is acceptable: LOCO still holds).
NATIVE_TO_CLASS: dict[str, str] = {
    "cat purring": "descansando",
    "cat meowing": "atencion",
    "cat growling": "enfadado",
    "cat hissing": "advertencia",
    "cat caterwauling": "llamada_apareamiento",
}


def highpass(data: np.ndarray, cutoff: float, fs: int, order: int) -> np.ndarray:
    if len(data) <= 3 * order:
        return data
    nyq = 0.5 * fs
    b, a = butter(order, cutoff / nyq, btype="high", analog=False)
    return filtfilt(b, a, data)


def split_windows(pcm: np.ndarray, sr: int, window_s: float) -> list[np.ndarray]:
    """Cut a clip into non-overlapping windows of `window_s` seconds.

    A short tail is dropped (it never reaches the YAMNet minimum of 0.96s
    on its own and the model already pads in extract_embeddings). Returns
    at least one window for any input >= sr * MIN_DURATION_S samples.
    """
    win = int(round(window_s * sr))
    if win <= 0:
        return [pcm]
    out: list[np.ndarray] = []
    for start in range(0, len(pcm), win):
        seg = pcm[start : start + win]
        if len(seg) >= int(MIN_DURATION_S * sr):
            out.append(seg)
    return out or [pcm[: int(MIN_DURATION_S * sr)]]


def process_clip(
    pcm: np.ndarray, sr: int, *, window_s: float
) -> list[np.ndarray]:
    """Mono + DC-remove + highpass + peak-normalize + windowing.

    VGG-Sound WAVs are already 16 kHz mono, but we do not trust that
    blindly: we still resample-if-needed, mixdown-if-needed, and apply
    the canonical preprocess used by prepare_pandeya / prepare_freesound.
    """
    if pcm.ndim > 1:
        pcm = pcm.mean(axis=1)
    if sr != TARGET_SR:
        from librosa import resample
        pcm = resample(pcm.astype(np.float32), orig_sr=sr, target_sr=TARGET_SR)
    pcm = pcm - np.mean(pcm)
    pcm = highpass(pcm, HIGHPASS_CUTOFF, TARGET_SR, HIGHPASS_ORDER)
    peak = float(np.max(np.abs(pcm)))
    if peak > 1e-6:
        pcm = pcm * (PEAK_TARGET / peak)
    pcm = pcm.astype(np.float32)
    return split_windows(pcm, TARGET_SR, window_s)


def slug_link(link: str) -> str:
    """YouTube ids are URL-safe already; this is just a paranoid normaliser."""
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in str(link))[:32] or "vgg"


def read_vgg_csv(path: Path) -> pd.DataFrame:
    """Read a VGG-Sound CSV with the messy leading unnamed column.

    Upstream uses Title-Case headers and a leading unnamed id column. We
    normalise everything to snake_case so the rest of the script can
    ignore CSV idiosyncrasies.
    """
    df = pd.read_csv(path)
    # The first column has no header in the upstream file; rename it.
    df = df.rename(columns={df.columns[0]: "file_id"})
    # Normalise Title-Case -> snake_case so "Link" / "link" both work.
    df = df.rename(columns={c: c.strip().lower() for c in df.columns if c != "file_id"})
    for col in ("file_id", "link", "label", "time", "split"):
        if col not in df.columns:
            raise ValueError(f"{path} is missing expected column {col!r}; got {list(df.columns)}")
    df["file_id"] = df["file_id"].astype(str)
    df["link"] = df["link"].astype(str)
    df["label"] = df["label"].astype(str).str.strip().str.lower()
    return df


def discover_audio(raw_dir: Path, split: str) -> dict[str, Path]:
    folder = raw_dir / f"audio_{split}"
    if not folder.is_dir():
        return {}
    return {p.stem: p for p in folder.glob("*.wav")}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--raw", type=Path, required=True, help="data/raw/VGGSound")
    ap.add_argument("--out", type=Path, default=Path("data/processed"))
    ap.add_argument(
        "--window-s", type=float, default=DEFAULT_WINDOW_S,
        help="Window length in seconds (default 4.0). Each 10s clip is split into "
             "len(clip)/window_s samples that share the same cat_id.",
    )
    ap.add_argument(
        "--max-per-class", type=int, default=0,
        help="Optional cap on samples written per target class. 0 = unlimited.",
    )
    ap.add_argument(
        "--purr-target", choices=["descansando", "feliz_contento", "both"], default="descansando",
        help="Where to map 'cat purring'. 'both' writes the clip into both classes "
             "(same cat_id) so LOCO still holds and the model learns the purr "
             "signature for both.",
    )
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    rng = np.random.default_rng(args.seed)
    raw_dir: Path = args.raw
    out_dir: Path = args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1) Load both CSVs and the file index for each split -----------------
    train_csv = raw_dir / "train.csv"
    test_csv = raw_dir / "test.csv"
    if not train_csv.exists():
        raise SystemExit(f"Missing: {train_csv}")
    frames = []
    audio_index: dict[str, Path] = {}
    for csv_path, split in [(train_csv, "train"), (test_csv, "test")]:
        if csv_path.exists():
            frames.append(read_vgg_csv(csv_path))
            audio_index.update(discover_audio(raw_dir, split))
    if not frames:
        raise SystemExit("No CSVs found under raw dir.")
    df = pd.concat(frames, ignore_index=True)
    print(f"[INFO] Loaded {len(df)} rows; {len(audio_index)} audio files on disk.")

    # 2) Filter to cats only, drop unknowns -------------------------------
    cat_mask = df["label"].str.startswith("cat ")
    dropped_dog = int((~cat_mask).sum())
    df = df[cat_mask].copy()
    df = df[df["label"].isin(NATIVE_TO_CLASS)].copy()
    unknown = df[~df["label"].isin(NATIVE_TO_CLASS)]
    if len(unknown):
        print(f"[WARN] {len(unknown)} cat rows with unmapped label dropped: "
              f"{sorted(unknown['label'].unique())}")
    print(f"[INFO] After dog filter + label map: {len(df)} rows "
          f"(dropped {dropped_dog} dog rows).")

    # 3) Per-class cap (rows, pre-windowing) -----------------------------
    if args.max_per_class > 0:
        keep_frames = []
        for cls, group in df.groupby("label", sort=False):
            if len(group) > args.max_per_class:
                idx = rng.choice(len(group), size=args.max_per_class, replace=False)
                keep_frames.append(group.iloc[idx])
            else:
                keep_frames.append(group)
        df = pd.concat(keep_frames, ignore_index=True)
        print(f"[INFO] After per-class cap={args.max_per_class}: {len(df)} rows.")

    # 4) Resolve audio path per row --------------------------------------
    df["audio_path"] = df["file_id"].map(audio_index)
    missing = df["audio_path"].isna().sum()
    if missing:
        print(f"[WARN] {missing} rows have no matching audio file on disk; skipped.")
        df = df[df["audio_path"].notna()].copy()

    # 5) Process and write ----------------------------------------------
    per_class_written: dict[str, int] = {}
    per_class_cats: dict[str, set[str]] = {}
    skipped_read = 0
    skipped_too_short = 0

    write_rows = []
    for label, group in df.groupby("label", sort=False):
        targets = (
            ["descansando", "feliz_contento"] if label == "cat purring"
            and args.purr_target == "both"
            else [NATIVE_TO_CLASS[label]]
        )
        if label == "cat purring" and args.purr_target == "feliz_contento":
            targets = ["feliz_contento"]

        for _, row in group.iterrows():
            audio_path: Path = row["audio_path"]
            cat_id = f"vgg_{slug_link(row['link'])}"
            try:
                pcm, sr = sf.read(str(audio_path), dtype="float32")
            except Exception as e:
                print(f"  [SKIP] read fail {audio_path.name}: {e}")
                skipped_read += 1
                continue
            windows = process_clip(pcm, sr, window_s=args.window_s)
            if not windows:
                skipped_too_short += 1
                continue
            for w_idx, w in enumerate(windows):
                seg_suffix = f"_seg{w_idx}" if len(windows) > 1 else ""
                out_name = f"{cat_id}{seg_suffix}__{uuid.uuid4().hex[:8]}.wav"
                for cls in targets:
                    write_rows.append((cls, cat_id, w, out_name))

    # 6) Persist -------------------------------------------------------
    for cls, cat_id, pcm, out_name in write_rows:
        if args.dry_run:
            per_class_written[cls] = per_class_written.get(cls, 0) + 1
            per_class_cats.setdefault(cls, set()).add(cat_id)
            continue
        dst = out_dir / cls
        dst.mkdir(parents=True, exist_ok=True)
        sf.write(str(dst / out_name), pcm, TARGET_SR, subtype="PCM_16")
        per_class_written[cls] = per_class_written.get(cls, 0) + 1
        per_class_cats.setdefault(cls, set()).add(cat_id)

    print()
    print("[RESULT] VGG-Sound ingestion")
    print(f"  rows scanned:        {len(df)}")
    print(f"  windows written:     {sum(per_class_written.values())}")
    print(f"  skipped_read:        {skipped_read}")
    print(f"  skipped_too_short:   {skipped_too_short}")
    print(f"  per-class samples:   {per_class_written}")
    print("  unique cat_ids:      {c: len(s) for c, s in per_class_cats.items()}")
    total_unique_cats = len({cid for s in per_class_cats.values() for cid in s})
    print(f"  total unique cats:   {total_unique_cats}")


if __name__ == "__main__":
    main()
