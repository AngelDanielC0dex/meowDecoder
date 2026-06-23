"""Prepare the Pandeya Cat Sound Classification Dataset V2 for MeowDecoder 10 classes.

Maps original folder names to MeowDecoder emotional states:
  Happy         → feliz_contento
  Angry         → enfadado
  Fighting      → pelea
  MotherCall    → llamada_madre
  Mating        → llamada_apareamiento
  Paining       → dolor
  Resting       → descansando
  HuntingMind   → trinos  (hunting chatter merged into trinos)
  Warning       → advertencia
  Defense       → advertencia

Usage:
  python scripts/prepare_pandeya.py --raw data/raw/pandeya --out data/processed
"""

from __future__ import annotations

import argparse
import uuid
from pathlib import Path

import soundfile as sf
import numpy as np
from scipy.signal import butter, filtfilt

TARGET_SR = 160_00

PANDEYA_MAPPING = {
    "Happy": "feliz_contento",
    "Angry": "enfadado",
    "Fighting": "pelea",
    "MotherCall": "llamada_madre",
    "Mating": "llamada_apareamiento",
    "Paining": "dolor",
    "Resting": "descansando",
    "HuntingMind": "trinos",
    "Warning": "advertencia",
    "Defense": "advertencia",
}


def highpass_filter(data: np.ndarray, cutoff: float = 100.0, fs: int = 16000, order: int = 5) -> np.ndarray:
    nyq = 0.5 * fs
    b, a = butter(order, cutoff / nyq, btype="high", analog=False)
    return filtfilt(b, a, data)


def preprocess_audio(file_path: Path, target_sr: int = 16000, cutoff: float = 100.0) -> np.ndarray:
    audio, sr = sf.read(str(file_path), dtype="float32")
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    if sr != target_sr:
        from librosa import resample

        audio = resample(audio, orig_sr=sr, target_sr=target_sr)
    audio = audio - np.mean(audio)
    if len(audio) > 3 * 5:
        audio = highpass_filter(audio, cutoff, target_sr)
    peak = np.max(np.abs(audio))
    if peak > 1e-6:
        audio = audio / peak
    return audio.astype(np.float32)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True, type=Path, help="Path to raw Pandeya dataset root")
    ap.add_argument("--out", default=Path("data/processed"), type=Path)
    args = ap.parse_args()

    count = 0
    for folder_name, target_class in PANDEYA_MAPPING.items():
        src_dir = args.raw / folder_name
        if not src_dir.exists():
            print(f"[WARN] Folder not found: {src_dir}")
            continue

        dst_dir = args.out / target_class
        dst_dir.mkdir(parents=True, exist_ok=True)

        wav_files = list(src_dir.glob("*.wav")) + list(src_dir.glob("*.mp3")) + list(src_dir.glob("*.ogg"))
        for wav in sorted(wav_files):
            try:
                pcm = preprocess_audio(wav)
                min_samples = int(0.96 * 16000)
                if len(pcm) < min_samples:
                    print(f"  [SKIP] Too short: {wav.name} ({len(pcm)/16000:.2f}s)")
                    continue
                cat_id = wav.stem.split("_")[0] if "_" in wav.stem else f"pandeya_{folder_name}"
                out_name = f"{cat_id}__{uuid.uuid4().hex[:8]}.wav"
                sf.write(str(dst_dir / out_name), pcm, 16000)
                count += 1
            except Exception as e:
                print(f"  [SKIP] Error processing {wav.name}: {e}")

    print(f"[DONE] Processed {count} files into {args.out}")


if __name__ == "__main__":
    main()