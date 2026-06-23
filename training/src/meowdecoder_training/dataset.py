"""Audio loading and normalisation utilities for MeowDecoder.

Only `load_wav_mono16k` is exported here; dataset discovery and cat_id
parsing live in yamnet_pipeline.py (via `parse_cat_id`) to keep a single
canonical implementation that all scripts share.

On-disk layout expected by the pipeline:
  data/processed/<class>/<cat_id>__<uuid8>.wav   (mono, 16 kHz)
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

_PEAK_TARGET = 0.891  # -1 dBFS; matches yamnet_pipeline.extract normalisation


def load_wav_mono16k(path: Path, sample_rate: int = 16000) -> np.ndarray:
    """Load a WAV file, downmix to mono, resample to `sample_rate`, and peak-normalise."""
    audio, sr = sf.read(path, dtype="float32", always_2d=True)
    mono = audio.mean(axis=1)
    if sr != sample_rate:
        n = int(round(len(mono) * sample_rate / sr))
        mono = np.interp(
            np.linspace(0, len(mono), n, endpoint=False),
            np.arange(len(mono)),
            mono,
        ).astype(np.float32)
    peak = np.abs(mono).max()
    if peak > 1e-6:
        mono = mono * (_PEAK_TARGET / peak)
    return mono
