"""Prosodic feature extractor — el eje que YAMNet descarta.

YAMNet fue entrenado en AudioSet para detectar EVENTOS ("Meow", "Cat", "Purr").
Colapsa happy-meow, demand-meow y pain-meow al mismo punto del embedding porque
lo que los distingue es la PROSODIA (contorno de F0, duración, aspereza), no el
timbre del evento. Este módulo calcula esa prosodia como un vector de longitud
fija que se concatena al embedding YAMNet antes de la cabeza densa.

Diseño:
  - 25 features, todas escalares y robustas a longitud variable.
  - Rango de F0 adaptado a vocalizaciones felinas (~70-1100 Hz).
  - Determinista y sin estado: misma entrada -> mismo vector. Esto es CRÍTICO
    para la paridad con el navegador (los mismos cálculos deberán replicarse en
    JS/ONNX). Por eso se evitan dependencias exóticas: solo numpy + librosa.
  - NaNs/inf se sustituyen por 0.0 (la StandardScaler aguas abajo normaliza).

Las features cubren cuatro ejes discriminantes de la familia maullido:
  CONTORNO   f0_mean, f0_std, f0_range, f0_slope, f0_median, voiced_frac,
             f0_start, f0_end, f0_delta (end-start)  -> feliz(plano) vs atencion(ascendente)
  TEMPORAL   duration, onset_rate, rms_attack, rms_decay, rms_mean, rms_std
  ASPEREZA   jitter, shimmer, hnr_proxy              -> dolor(áspero) vs feliz(limpio)
  ESPECTRAL  centroid_mean, centroid_std, rolloff_mean, bandwidth_mean,
             flatness_mean, zcr_mean
"""

from __future__ import annotations

import numpy as np

# Orden FIJO de las features (no reordenar: rompería embeddings ya extraídos).
FEATURE_NAMES: list[str] = [
    # contorno F0
    "f0_mean", "f0_std", "f0_range", "f0_slope", "f0_median",
    "voiced_frac", "f0_start", "f0_end", "f0_delta",
    # temporal
    "duration", "onset_rate", "rms_attack", "rms_decay", "rms_mean", "rms_std",
    # aspereza
    "jitter", "shimmer", "hnr_proxy",
    # espectral
    "centroid_mean", "centroid_std", "rolloff_mean", "bandwidth_mean",
    "flatness_mean", "zcr_mean", "n_onsets",
]
PROSODIC_DIM = len(FEATURE_NAMES)  # 25

# Rango de F0 para gatos (Hz). Las vocalizaciones felinas van ~250-1500 Hz pero
# permitimos un margen inferior para gruñidos graves.
F0_MIN = 70.0
F0_MAX = 1100.0


def _safe(x: float) -> float:
    if x is None or not np.isfinite(x):
        return 0.0
    return float(x)


def extract_prosodic(pcm: np.ndarray, sr: int = 16000) -> np.ndarray:
    """Devuelve un vector (PROSODIC_DIM,) de features prosódicas.

    `pcm` debe ser mono float32 ya normalizado (pico ~1.0). No modifica la
    entrada. Robusto a clips cortos / silenciosos (devuelve ceros donde no
    aplica).
    """
    import librosa

    out = np.zeros(PROSODIC_DIM, dtype=np.float32)
    if pcm is None or len(pcm) < int(0.05 * sr):
        return out

    pcm = np.asarray(pcm, dtype=np.float32)
    idx = {n: i for i, n in enumerate(FEATURE_NAMES)}

    # ── F0 / contorno via pyin ────────────────────────────────────────────────
    try:
        f0, voiced, _ = librosa.pyin(
            pcm, fmin=F0_MIN, fmax=F0_MAX, sr=sr,
            frame_length=1024, hop_length=256,
        )
        f0v = f0[~np.isnan(f0)] if f0 is not None else np.array([])
    except Exception:
        f0v = np.array([])
        voiced = None

    if len(f0v) >= 2:
        out[idx["f0_mean"]]   = _safe(np.mean(f0v))
        out[idx["f0_std"]]    = _safe(np.std(f0v))
        out[idx["f0_range"]]  = _safe(np.max(f0v) - np.min(f0v))
        out[idx["f0_median"]] = _safe(np.median(f0v))
        # pendiente: regresión lineal del contorno normalizada por longitud
        t = np.arange(len(f0v), dtype=np.float32)
        try:
            slope = np.polyfit(t, f0v, 1)[0]
        except Exception:
            slope = 0.0
        out[idx["f0_slope"]] = _safe(slope)
        out[idx["f0_start"]] = _safe(np.mean(f0v[: max(1, len(f0v) // 5)]))
        out[idx["f0_end"]]   = _safe(np.mean(f0v[-max(1, len(f0v) // 5):]))
        out[idx["f0_delta"]] = out[idx["f0_end"]] - out[idx["f0_start"]]

        # jitter: variación ciclo-a-ciclo de F0 (aspereza de pitch)
        d = np.abs(np.diff(f0v))
        out[idx["jitter"]] = _safe(np.mean(d) / (np.mean(f0v) + 1e-8))

    if voiced is not None and len(voiced):
        out[idx["voiced_frac"]] = _safe(np.mean(voiced.astype(np.float32)))

    # ── Envolvente RMS / temporal ─────────────────────────────────────────────
    hop = 256
    rms = librosa.feature.rms(y=pcm, frame_length=1024, hop_length=hop)[0]
    out[idx["duration"]]  = _safe(len(pcm) / sr)
    out[idx["rms_mean"]]  = _safe(np.mean(rms))
    out[idx["rms_std"]]   = _safe(np.std(rms))
    if len(rms) >= 3:
        peak_i = int(np.argmax(rms))
        # ataque: tiempo (frac) hasta el pico; caída: pendiente media tras el pico
        out[idx["rms_attack"]] = _safe(peak_i / max(1, len(rms) - 1))
        tail = rms[peak_i:]
        if len(tail) >= 2:
            out[idx["rms_decay"]] = _safe((tail[0] - tail[-1]) / (len(tail) + 1e-8))
        # shimmer: variación ciclo-a-ciclo de amplitud
        dr = np.abs(np.diff(rms))
        out[idx["shimmer"]] = _safe(np.mean(dr) / (np.mean(rms) + 1e-8))

    # onsets (sílabas / insistencia — clave para "demanda" repetitiva)
    try:
        onsets = librosa.onset.onset_detect(y=pcm, sr=sr, hop_length=hop, units="frames")
        n_on = len(onsets)
    except Exception:
        n_on = 0
    dur = out[idx["duration"]] or (len(pcm) / sr)
    out[idx["n_onsets"]]   = _safe(n_on)
    out[idx["onset_rate"]] = _safe(n_on / (dur + 1e-8))

    # ── HNR proxy (armonicidad: dolor áspero vs ronroneo/feliz limpio) ────────
    try:
        harm, perc = librosa.effects.hpss(pcm)
        e_h = float(np.sum(harm ** 2))
        e_p = float(np.sum(perc ** 2)) + 1e-8
        out[idx["hnr_proxy"]] = _safe(10.0 * np.log10((e_h + 1e-8) / e_p))
    except Exception:
        pass

    # ── Espectral ─────────────────────────────────────────────────────────────
    try:
        cen = librosa.feature.spectral_centroid(y=pcm, sr=sr, hop_length=hop)[0]
        out[idx["centroid_mean"]] = _safe(np.mean(cen))
        out[idx["centroid_std"]]  = _safe(np.std(cen))
        rol = librosa.feature.spectral_rolloff(y=pcm, sr=sr, hop_length=hop)[0]
        out[idx["rolloff_mean"]]  = _safe(np.mean(rol))
        bw = librosa.feature.spectral_bandwidth(y=pcm, sr=sr, hop_length=hop)[0]
        out[idx["bandwidth_mean"]] = _safe(np.mean(bw))
        flat = librosa.feature.spectral_flatness(y=pcm, hop_length=hop)[0]
        out[idx["flatness_mean"]]  = _safe(np.mean(flat))
        zcr = librosa.feature.zero_crossing_rate(pcm, hop_length=hop)[0]
        out[idx["zcr_mean"]]       = _safe(np.mean(zcr))
    except Exception:
        pass

    return np.nan_to_num(out, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)
