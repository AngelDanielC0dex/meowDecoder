import { describe, it, expect, vi } from "vitest";
import { analyzeAudio } from "@/application/use-cases/analyze-audio";
import type { AudioPipeline } from "@/application/ports/audio-pipeline";
import type { InferenceEngine } from "@/application/ports/inference-engine";
import type { SessionRepository } from "@/application/ports/repositories";
import type { Telemetry } from "@/application/ports/telemetry";
import type { AcousticFeatures } from "@/domain/analysis/features";
import { ok, err } from "@/domain/shared/result";
import { buildClassification } from "@/domain/analysis/classification";

const features: AcousticFeatures = {
  durationS: 0.6,
  rms: 0.3,
  f0Hz: 500,
  f0StartHz: 480,
  f0EndHz: 520,
  f0RangeHz: 40,
  voicedRatio: 0.8,
  spectralCentroidHz: 1500,
  spectralFlatness: 0.05,
  zeroCrossingRate: 1000,
  amRateHz: null,
  amStrength: 0,
};

const telemetry: Telemetry = { track: vi.fn(), error: vi.fn() };

function fakePipeline(hasSegment: boolean): AudioPipeline {
  return {
    process: async () =>
      hasSegment
        ? ok({
            segments: [{ startS: 0, endS: 0.6, features }],
            bestSegmentPcm: new Float32Array(9600),
            recordingDurationS: 0.6,
          })
        : err({ code: "analysis/no-vocalization", message: "none" }),
  };
}

const fakeEngine: InferenceEngine = {
  id: "fake",
  modelVersion: "fake-1",
  ready: async () => ok(undefined),
  classify: async () =>
    ok(buildClassification([{ cls: "atencion", probability: 0.9 }], "fake", "fake-1")),
  dispose: () => {},
};

describe("analyzeAudio use case", () => {
  it("persists a classified session on success", async () => {
    const saved: unknown[] = [];
    const sessions = {
      save: async (s: unknown) => void saved.push(s),
    } as unknown as SessionRepository;

    const res = await analyzeAudio(
      { pipeline: fakePipeline(true), engine: fakeEngine, sessions, telemetry },
      { audio: new Blob(), source: "file", catId: null, keepAudio: false, persist: true },
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.classification.primary.cls).toBe("atencion");
      expect(res.value.audioKey).toBeNull();
    }
    expect(saved).toHaveLength(1);
  });

  it("returns a domain error when no vocalization is found", async () => {
    const sessions = { save: vi.fn() } as unknown as SessionRepository;
    const res = await analyzeAudio(
      { pipeline: fakePipeline(false), engine: fakeEngine, sessions, telemetry },
      { audio: new Blob(), source: "microphone", catId: null, keepAudio: false, persist: true },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("analysis/no-vocalization");
    expect(sessions.save).not.toHaveBeenCalled();
  });

  it("sets an audioKey when keepAudio is requested", async () => {
    const sessions = { save: vi.fn(async () => {}) } as unknown as SessionRepository;
    const res = await analyzeAudio(
      { pipeline: fakePipeline(true), engine: fakeEngine, sessions, telemetry },
      { audio: new Blob(["x"]), source: "file", catId: null, keepAudio: true, persist: true },
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.audioKey).toMatch(/^audio:/);
  });

  it("does NOT persist (or keep audio) for an anonymous one-off analysis", async () => {
    const sessions = { save: vi.fn(async () => {}) } as unknown as SessionRepository;
    const res = await analyzeAudio(
      { pipeline: fakePipeline(true), engine: fakeEngine, sessions, telemetry },
      // Anonymous: persist=false even though keepAudio was left on.
      { audio: new Blob(["x"]), source: "file", catId: null, keepAudio: true, persist: false },
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.audioKey).toBeNull();
    expect(sessions.save).not.toHaveBeenCalled();
  });
});
