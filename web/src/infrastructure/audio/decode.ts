import { SAMPLE_RATE } from "../dsp/constants";
import { err, ok, type Result } from "@/domain/shared/result";

/**
 * Decode any supported container (WAV/MP3/M4A/WebM-Opus from MediaRecorder)
 * and resample to mono 16 kHz using OfflineAudioContext.
 *
 * Decision (vs hand-written resampler in the worker): the browser ships a
 * native, battle-tested decoder + high-quality resampler. Reimplementing
 * either is pure liability. These APIs are async and do not block the main
 * thread; the worker takes over from the clean PCM onwards.
 */
export async function decodeToMono16k(blob: Blob): Promise<Result<Float32Array>> {
  let decoded: AudioBuffer;
  try {
    const arrayBuffer = await blob.arrayBuffer();
    // Decode at the file's native rate first (decodeAudioData resampling
    // behavior varies across browsers; OfflineAudioContext is deterministic).
    const probe = new AudioContext();
    try {
      decoded = await probe.decodeAudioData(arrayBuffer);
    } finally {
      void probe.close();
    }
  } catch (e) {
    return err({ code: "audio/decode-failed", message: "Could not decode audio", cause: e });
  }

  if (decoded.duration < MIN_DURATION_S) {
    return err({ code: "audio/too-short", message: "Recording shorter than 500 ms" });
  }
  if (decoded.duration > MAX_DURATION_S) {
    return err({
      code: "audio/too-long",
      message: `Recording longer than ${MAX_DURATION_S} seconds`,
    });
  }

  try {
    const length = Math.ceil(decoded.duration * SAMPLE_RATE);
    const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded; // multi-channel input is mixed down to mono by the 1-channel context
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return ok(rendered.getChannelData(0).slice());
  } catch (e) {
    return err({ code: "audio/resample-failed", message: "Could not resample audio", cause: e });
  }
}

export const ACCEPTED_AUDIO_TYPES = [
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
];
export const ACCEPTED_AUDIO_EXTENSIONS = ".wav,.mp3,.m4a,.aac,.ogg,.oga,.opus,.webm,.flac,audio/*";

/** Shortest accepted clip (s). Below this there is no usable vocalization. */
export const MIN_DURATION_S = 0.5;
/** Longest accepted clip (s). A cat vocalization sample fits well under this. */
export const MAX_DURATION_S = 20;
/** Upload size cap. 20 s of audio in any common format stays far below this. */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const MAX_UPLOAD_MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
