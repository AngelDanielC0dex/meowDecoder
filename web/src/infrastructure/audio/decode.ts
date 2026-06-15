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

  if (decoded.duration < 0.1) {
    return err({ code: "audio/too-short", message: "Recording shorter than 100 ms" });
  }
  if (decoded.duration > 120) {
    return err({ code: "audio/too-long", message: "Recording longer than 2 minutes" });
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

export const ACCEPTED_AUDIO_TYPES = ["audio/wav", "audio/mpeg", "audio/mp4", "audio/x-m4a"];
export const ACCEPTED_AUDIO_EXTENSIONS = ".wav,.mp3,.m4a,audio/*";
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
