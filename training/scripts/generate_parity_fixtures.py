"""Generate the log-mel parity fixtures shared by the JS and Python tests.

To keep the fixture small and clean, we DON'T embed raw PCM. Instead both sides
regenerate identical signals from a shared recipe (analytic formulas + a
mulberry32 PRNG implemented the same way in Python and TS). The fixture stores
only the expected log-mel matrix Python produces, which the TS test then
reproduces within tolerance — catching any JS/Python feature drift in CI.

Usage: python scripts/generate_parity_fixtures.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

SAMPLE_RATE = 16000
N_MELS = 64
N_FRAMES = 96
N_SAMPLES = (N_FRAMES - 1) * 256 + 512  # exactly fills the window: 24832


def mulberry32(seed: int):
    """Tiny deterministic PRNG. Mirrored byte-for-byte in the TS test."""
    state = seed & 0xFFFFFFFF

    def next_float() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        t &= 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return next_float


def make_signal(kind: str) -> np.ndarray:
    t = np.arange(N_SAMPLES) / SAMPLE_RATE
    if kind == "tone_440":
        return (0.8 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    if kind == "tone_900":
        return (0.6 * np.sin(2 * np.pi * 900 * t)).astype(np.float32)
    if kind == "chirp":
        f = np.linspace(300, 1200, N_SAMPLES)
        return (0.7 * np.sin(2 * np.pi * np.cumsum(f) / SAMPLE_RATE)).astype(np.float32)
    if kind == "noise":
        rng = mulberry32(7)
        return np.array([(rng() * 2 - 1) * 0.5 for _ in range(N_SAMPLES)], dtype=np.float32)
    raise ValueError(kind)


def main() -> None:
    from meowdecoder_training.features import log_mel

    cases = []
    for kind in ["tone_440", "tone_900", "chirp", "noise"]:
        pcm = make_signal(kind)
        mel = log_mel(pcm, sample_rate=SAMPLE_RATE, n_mels=N_MELS, n_frames=N_FRAMES)
        cases.append(
            {
                "kind": kind,
                "nMels": N_MELS,
                "nFrames": N_FRAMES,
                "logMel": mel.astype(float).round(4).flatten().tolist(),
            }
        )

    out = Path("../web/tests/fixtures/parity.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"sampleRate": SAMPLE_RATE, "nSamples": N_SAMPLES, "cases": cases}))
    print(f"Wrote {len(cases)} cases → {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
