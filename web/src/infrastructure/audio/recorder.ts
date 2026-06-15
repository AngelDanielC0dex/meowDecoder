import { err, ok, type Result } from "@/domain/shared/result";

export interface RecorderHandle {
  /** Resolves with the recorded blob when stop() is called. */
  readonly result: Promise<Result<Blob>>;
  stop(): void;
  cancel(): void;
  /** Live level 0..1 for the UI meter (AnalyserNode, runs off-main-thread natively). */
  getLevel(): number;
}

/**
 * Microphone capture via MediaRecorder.
 *
 * - Permission is requested HERE, i.e. only after an explicit user gesture.
 * - mimeType negotiated per browser (iOS Safari: mp4/aac; others: webm/opus).
 * - Level metering uses AnalyserNode, not an AudioWorklet: a worklet is only
 *   warranted for sample-accurate streaming DSP, which we don't do live —
 *   the full pipeline runs after recording. Simplest correct tool wins.
 */
export async function startRecording(): Promise<Result<RecorderHandle>> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return err({ code: "mic/unsupported", message: "getUserMedia not available" });
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "Unknown";
    const code = name === "NotAllowedError" ? "mic/denied" : "mic/unavailable";
    return err({ code, message: `Microphone error: ${name}`, cause: e });
  }

  const mimeType = pickMimeType();
  let recorder: MediaRecorder;
  try {
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  } catch (e) {
    stopTracks(stream);
    return err({ code: "mic/recorder-failed", message: "MediaRecorder init failed", cause: e });
  }

  // Live level meter. On iOS Safari an AudioContext starts "suspended" and
  // must be resumed from within the user gesture (we are: startRecording is
  // invoked from the record-button click), or the analyser reads pure silence.
  const audioContext = new AudioContext();
  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }
  const sourceNode = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  sourceNode.connect(analyser);
  const levelBuf = new Float32Array(analyser.fftSize);

  const chunks: BlobPart[] = [];
  let settled = false;

  const result = new Promise<Result<Blob>>((resolve) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      cleanup();
      if (settled) return;
      settled = true;
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      resolve(
        blob.size > 0
          ? ok(blob)
          : err({ code: "mic/empty-recording", message: "No audio captured" }),
      );
    };
    recorder.onerror = () => {
      cleanup();
      if (settled) return;
      settled = true;
      resolve(err({ code: "mic/recording-error", message: "Recording failed" }));
    };
  });

  function cleanup() {
    stopTracks(stream);
    void audioContext.close();
  }

  recorder.start(250); // collect chunks so a crash loses ≤250 ms

  return ok({
    result,
    stop: () => {
      if (recorder.state !== "inactive") recorder.stop();
    },
    cancel: () => {
      settled = true;
      if (recorder.state !== "inactive") recorder.stop();
      cleanup();
    },
    getLevel: () => {
      analyser.getFloatTimeDomainData(levelBuf);
      let peak = 0;
      for (let i = 0; i < levelBuf.length; i++) {
        const a = Math.abs(levelBuf[i]!);
        if (a > peak) peak = a;
      }
      return peak;
    },
  });
}

function pickMimeType(): string | null {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
}

function stopTracks(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}
