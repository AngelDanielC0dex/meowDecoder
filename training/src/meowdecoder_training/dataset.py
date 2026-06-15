"""Dataset ingestion, normalization and grouped splitting.

Initial datasets (MVP):
  - CatMeows (Zenodo 4008297): ~440 labeled meows, 21 cats, 3 contexts.
  - Meowsic / curated AudioSet "Cat" clips for hiss/growl/yowl coverage.

Expected on-disk layout (after `prepare_catmeows.py`):
  data/processed/<class>/<cat_id>__<uuid>.wav   (mono, 16 kHz)

The <cat_id> prefix lets us split by emitter to prevent identity leakage.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf

_NAME_RE = re.compile(r"^(?P<cat>[^_]+)__")


@dataclass(frozen=True)
class Sample:
    path: Path
    label: str
    cat_id: str


def load_wav_mono16k(path: Path, sample_rate: int = 16000) -> np.ndarray:
    audio, sr = sf.read(path, dtype="float32", always_2d=True)
    mono = audio.mean(axis=1)
    if sr != sample_rate:
        # Linear resample is sufficient here; final inference uses the same
        # native browser resampler. Heavy SRC would be over-engineering.
        n = int(round(len(mono) * sample_rate / sr))
        mono = np.interp(
            np.linspace(0, len(mono), n, endpoint=False),
            np.arange(len(mono)),
            mono,
        ).astype(np.float32)
    peak = np.abs(mono).max()
    if peak > 1e-6:
        mono = mono * (0.891 / peak)  # match PEAK_TARGET (-1 dBFS)
    return mono


def discover(processed_dir: Path, classes: list[str]) -> list[Sample]:
    samples: list[Sample] = []
    for cls in classes:
        for wav in sorted((processed_dir / cls).glob("*.wav")):
            m = _NAME_RE.match(wav.name)
            cat_id = m.group("cat") if m else "unknown"
            samples.append(Sample(path=wav, label=cls, cat_id=cat_id))
    return samples


def class_weights(samples: list[Sample], classes: list[str]) -> np.ndarray:
    """Inverse-frequency weights for the imbalanced loss (hiss/growl are rare)."""
    counts = np.array([sum(s.label == c for s in samples) for c in classes], dtype=np.float64)
    counts = np.maximum(counts, 1)
    w = counts.sum() / (len(classes) * counts)
    return (w / w.mean()).astype(np.float32)
