"""Parametric synthetic vocalization generators.

Purpose: produce a REAL end-to-end ONNX model (train → export → browser) when no
real dataset is available in the environment, and provide the deterministic
evaluation family used by the TS regression tests (model vs heuristic baseline).

Each generator synthesizes a signal family whose acoustic signature mirrors the
class definition in the product taxonomy (and the heuristic engine):
  meow  — harmonic tone, f0 350–700 Hz, mild contour, 0.4–1.2 s
  purr  — low carrier 60–140 Hz with strong 20–35 Hz amplitude modulation, long
  trill — voiced 450–800 Hz with fast (15–30 Hz) frequency modulation, short
  hiss  — broadband brightened noise, 0.3–1.0 s, unvoiced
  growl — low 70–180 Hz, harmonically rich/dark, sustained
  yowl  — long (≥1.2 s) wide pitch sweep 250→900→400 Hz

IMPORTANT: this is a *family* match to real cat acoustics, not real cat data.
The model trained here is an integration/contract artifact; see
docs/model-contract.md. The CatMeows pipeline replaces it without code changes.
"""

from __future__ import annotations

import numpy as np

SR = 16000
N = (96 - 1) * 256 + 512  # 24832 samples = exactly one log-mel window (1.552 s)

CLASSES = ["meow", "purr", "trill", "hiss", "growl", "yowl"]


def _envelope(n_active: int, rng: np.random.Generator) -> np.ndarray:
    """Attack/decay envelope for the active region."""
    attack = max(1, int(n_active * rng.uniform(0.05, 0.15)))
    decay = max(1, int(n_active * rng.uniform(0.1, 0.3)))
    env = np.ones(n_active)
    env[:attack] = np.linspace(0, 1, attack)
    env[-decay:] *= np.linspace(1, 0, decay)
    return env


def _place(active: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Center the active region inside the fixed window with random offset."""
    out = np.zeros(N, dtype=np.float64)
    margin = N - len(active)
    start = int(rng.uniform(0.2, 0.8) * margin) if margin > 0 else 0
    out[start : start + len(active)] = active
    return out


def _harmonic_tone(freqs: np.ndarray, amps: list[float], rng: np.random.Generator) -> np.ndarray:
    phase = 2 * np.pi * np.cumsum(freqs) / SR
    sig = np.zeros_like(phase)
    for k, a in enumerate(amps, start=1):
        sig += a * np.sin(k * phase + rng.uniform(0, 2 * np.pi))
    return sig


def gen_meow(rng: np.random.Generator) -> np.ndarray:
    dur = rng.uniform(0.4, 1.2)
    n = int(dur * SR)
    f0 = rng.uniform(350, 700)
    contour = rng.uniform(-0.25, 0.15)
    freqs = f0 * (1 + contour * np.linspace(0, 1, n))
    sig = _harmonic_tone(freqs, [1.0, 0.5, 0.25], rng) * _envelope(n, rng)
    return _place(sig, rng)


def gen_purr(rng: np.random.Generator) -> np.ndarray:
    dur = rng.uniform(1.3, 1.55)
    n = min(int(dur * SR), N)
    f0 = rng.uniform(60, 140)
    f_am = rng.uniform(20, 35)
    t = np.arange(n) / SR
    carrier = _harmonic_tone(np.full(n, f0), [1.0, 0.4], rng)
    am = 0.5 * (1 + np.sin(2 * np.pi * f_am * t + rng.uniform(0, 2 * np.pi)))
    sig = 0.6 * carrier * am * _envelope(n, rng)
    return _place(sig, rng)


def gen_trill(rng: np.random.Generator) -> np.ndarray:
    dur = rng.uniform(0.3, 0.9)
    n = int(dur * SR)
    f0 = rng.uniform(450, 800)
    depth = rng.uniform(80, 200)
    f_mod = rng.uniform(15, 30)
    t = np.arange(n) / SR
    freqs = f0 + depth * np.sin(2 * np.pi * f_mod * t)
    sig = _harmonic_tone(freqs, [1.0, 0.4], rng) * _envelope(n, rng)
    return _place(sig, rng)


def gen_hiss(rng: np.random.Generator) -> np.ndarray:
    dur = rng.uniform(0.3, 1.0)
    n = int(dur * SR)
    noise = rng.standard_normal(n)
    # First-difference style filter brightens the spectrum (hiss is high-centroid)
    bright = noise - rng.uniform(0.5, 0.8) * np.concatenate([[0], noise[:-1]])
    sig = bright * _envelope(n, rng)
    return _place(sig, rng)


def gen_growl(rng: np.random.Generator) -> np.ndarray:
    dur = rng.uniform(0.8, 1.5)
    n = min(int(dur * SR), N)
    f0 = rng.uniform(70, 180)
    jitter = 1 + 0.02 * rng.standard_normal(n).cumsum() / np.sqrt(np.arange(1, n + 1))
    freqs = np.clip(f0 * jitter, 50, 300)
    sig = _harmonic_tone(freqs, [1.0, 0.8, 0.6, 0.45, 0.3], rng) * _envelope(n, rng)
    return _place(sig, rng)


def gen_yowl(rng: np.random.Generator) -> np.ndarray:
    dur = rng.uniform(1.2, 1.55)
    n = min(int(dur * SR), N)
    f_start = rng.uniform(250, 450)
    f_peak = rng.uniform(600, 900)
    f_end = rng.uniform(300, 500)
    x = np.linspace(0, 1, n)
    freqs = f_start + (f_peak - f_start) * np.sin(np.pi * x) + (f_end - f_start) * x
    sig = _harmonic_tone(freqs, [1.0, 0.5], rng) * _envelope(n, rng)
    return _place(sig, rng)


GENERATORS = {
    "meow": gen_meow,
    "purr": gen_purr,
    "trill": gen_trill,
    "hiss": gen_hiss,
    "growl": gen_growl,
    "yowl": gen_yowl,
}


def synth(cls: str, rng: np.random.Generator) -> np.ndarray:
    sig = GENERATORS[cls](rng)
    peak = np.abs(sig).max()
    if peak > 1e-9:
        sig = sig * (0.7 / peak)
    sig = sig + 0.005 * rng.standard_normal(N)  # domestic noise floor
    return sig.astype(np.float32)
