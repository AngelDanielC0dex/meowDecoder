/**
 * Acoustic features extracted from one vocalization segment.
 * This is the contract between the DSP pipeline and inference engines,
 * and what we persist alongside feedback for future model improvement.
 */
export interface AcousticFeatures {
  /** Segment duration in seconds. */
  readonly durationS: number;
  /** Root-mean-square level (0..1) of the normalized segment. */
  readonly rms: number;
  /** Median fundamental frequency in Hz; null when no periodicity found. */
  readonly f0Hz: number | null;
  /** f0 at start/end of voiced region (Hz) — contour direction. Null if unvoiced. */
  readonly f0StartHz: number | null;
  readonly f0EndHz: number | null;
  /** f0 range (max-min) across the voiced region in Hz; 0 if unvoiced. */
  readonly f0RangeHz: number;
  /** Fraction of frames with detectable periodicity (0..1). */
  readonly voicedRatio: number;
  /** Spectral centroid in Hz (brightness). */
  readonly spectralCentroidHz: number;
  /** Spectral flatness 0..1 (1 = white noise, ~0 = pure tone). */
  readonly spectralFlatness: number;
  /** Zero-crossing rate (crossings per second). */
  readonly zeroCrossingRate: number;
  /**
   * Dominant amplitude-modulation rate of the envelope in Hz, null if none.
   * Purring shows strong AM at ~20–40 Hz.
   */
  readonly amRateHz: number | null;
  /** Strength of that modulation 0..1. */
  readonly amStrength: number;
}

export interface AnalyzedSegment {
  /** Offset of the segment inside the original recording, seconds. */
  readonly startS: number;
  readonly endS: number;
  readonly features: AcousticFeatures;
}
