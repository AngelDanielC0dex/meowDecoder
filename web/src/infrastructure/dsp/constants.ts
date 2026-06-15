/** Single source of truth for DSP parameters. Mirrored by training/src/.../features.py — keep in sync (parity test in CI). */
export const SAMPLE_RATE = 16_000 as const;

/** 32 ms analysis frames, 16 ms hop — standard for short bioacoustic events. */
export const FRAME_SIZE = 512;
export const HOP_SIZE = 256;

/** Peak normalization target (-1 dBFS) leaves headroom against clipping artifacts. */
export const PEAK_TARGET = 0.891;

/** f0 search range covering meow/trill/yowl/hiss-growl pitch (purr handled via AM). */
export const F0_MIN_HZ = 50;
export const F0_MAX_HZ = 1200;

/** Amplitude-modulation search range — purring pulses at ~20–40 Hz. */
export const AM_MIN_HZ = 15;
export const AM_MAX_HZ = 45;

/** VAD / segmentation (values in seconds unless noted). */
export const VAD_HANGOVER_S = 0.128;
export const MIN_SEGMENT_S = 0.15;
export const MERGE_GAP_S = 0.25;
export const SEGMENT_PAD_S = 0.1;
export const MAX_SEGMENT_S = 10;
