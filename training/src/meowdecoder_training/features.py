"""Log-mel feature extraction.

CRITICAL: this MUST stay numerically aligned with the browser implementation in
web/src/infrastructure/inference/log-mel.ts. The parity test
(tests/test_parity.py here + web parity fixtures) pins both. A drift here
silently degrades in-browser accuracy, so the contract is tested, not assumed.
"""

from __future__ import annotations

import numpy as np


def hann_window(n: int) -> np.ndarray:
    return 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(n) / (n - 1))


def hz_to_mel(hz: np.ndarray | float) -> np.ndarray | float:
    return 2595.0 * np.log10(1.0 + np.asarray(hz) / 700.0)


def mel_to_hz(mel: np.ndarray | float) -> np.ndarray | float:
    return 700.0 * (10.0 ** (np.asarray(mel) / 2595.0) - 1.0)


def mel_filterbank(n_mels: int, fft_size: int, sample_rate: int, f_min: float = 50.0) -> np.ndarray:
    n_bins = fft_size // 2 + 1
    f_max = sample_rate / 2
    mel_points = mel_to_hz(
        np.linspace(hz_to_mel(f_min), hz_to_mel(f_max), n_mels + 2)
    )
    bins = np.floor((fft_size + 1) * mel_points / sample_rate).astype(int)

    fb = np.zeros((n_mels, n_bins), dtype=np.float64)
    for m in range(1, n_mels + 1):
        left, center, right = bins[m - 1], bins[m], bins[m + 1]
        for k in range(left, center):
            if 0 <= k < n_bins and center != left:
                fb[m - 1, k] = (k - left) / (center - left)
        for k in range(center, right + 1):
            if 0 <= k < n_bins and right != center:
                fb[m - 1, k] = (right - k) / (right - center)
    return fb


def power_spectrum(frame: np.ndarray, fft_size: int) -> np.ndarray:
    windowed = frame * hann_window(fft_size)
    spec = np.fft.rfft(windowed, n=fft_size)
    return (spec.real**2 + spec.imag**2).astype(np.float64)


def log_mel(
    pcm: np.ndarray,
    *,
    sample_rate: int = 16000,
    frame_size: int = 512,
    hop_size: int = 256,
    n_mels: int = 64,
    n_frames: int = 96,
    f_min: float = 50.0,
) -> np.ndarray:
    """Returns a standardized (mean 0, std 1) log-mel spectrogram (n_mels, n_frames)."""
    fb = mel_filterbank(n_mels, frame_size, sample_rate, f_min)

    needed = (n_frames - 1) * hop_size + frame_size
    padded = np.zeros(needed, dtype=np.float64)
    offset = max(0, (len(pcm) - needed) // 2)
    chunk = pcm[offset : offset + min(needed, len(pcm) - offset)]
    padded[: len(chunk)] = chunk

    out = np.zeros((n_mels, n_frames), dtype=np.float32)
    for t in range(n_frames):
        start = t * hop_size
        spec = power_spectrum(padded[start : start + frame_size], frame_size)
        out[:, t] = np.log(fb @ spec + 1e-6)

    mean = out.mean()
    std = out.std() + 1e-6
    return ((out - mean) / std).astype(np.float32)
