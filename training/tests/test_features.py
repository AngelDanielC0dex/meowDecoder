"""Unit tests for the Python feature extractor."""

import numpy as np

from meowdecoder_training.features import log_mel, mel_filterbank


def test_log_mel_shape_and_standardization():
    pcm = np.random.default_rng(0).standard_normal(24000).astype(np.float32)
    mel = log_mel(pcm, n_mels=64, n_frames=96)
    assert mel.shape == (64, 96)
    # Standardized to ~zero mean, unit std.
    assert abs(float(mel.mean())) < 1e-3
    assert abs(float(mel.std()) - 1.0) < 1e-2


def test_log_mel_deterministic():
    pcm = np.sin(2 * np.pi * 440 * np.arange(24000) / 16000).astype(np.float32)
    a = log_mel(pcm)
    b = log_mel(pcm)
    assert np.allclose(a, b)


def test_filterbank_is_nonnegative_and_covers_bins():
    fb = mel_filterbank(64, 512, 16000)
    assert fb.shape == (64, 257)
    assert (fb >= 0).all()
    assert fb.sum() > 0


def test_short_signal_is_padded_not_crashed():
    mel = log_mel(np.ones(500, dtype=np.float32), n_frames=96)
    assert mel.shape == (64, 96)
