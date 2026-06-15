import type { InferenceEngine, InferenceInput } from "@/application/ports/inference-engine";
import { buildClassification, type ClassScore } from "@/domain/analysis/classification";
import { applyCatPriors, type CatPriors } from "@/domain/analysis/cat-priors";
import { applyUnknownPolicy } from "@/domain/analysis/contract";
import type { AcousticFeatures } from "@/domain/analysis/features";
import type { Classification } from "@/domain/analysis/classification";
import { ok, type Result } from "@/domain/shared/result";

/**
 * Engine v1: rule-based scoring over acoustic features.
 *
 * Each class scores 0..1 from acoustically grounded evidence
 * (feline bioacoustics: Schötz 2019; Tavernier 2020 / CatMeows):
 *  - purr:  strong amplitude modulation at ~20–40 Hz, low brightness, long
 *  - hiss:  broadband noise (high flatness), unvoiced, bright, no f0
 *  - growl: voiced & low f0 (<250 Hz), dark, sustained
 *  - meow:  voiced, f0 ~250–800 Hz, harmonic, 0.3–2 s
 *  - trill: voiced, f0 modulated (large range, short), rising
 *  - yowl:  voiced, long (>1.5 s), wide f0 excursion
 *
 * Scores are normalized into a distribution; the shared domain logic decides
 * certainty/ambiguity exactly as it will for the CNN. Honest by construction:
 * weak evidence yields a low-confidence `unknown`.
 */
export class HeuristicEngine implements InferenceEngine {
  readonly id = "heuristic-dsp";
  readonly modelVersion = "heuristic-1.0.0";

  async ready(): Promise<Result<void>> {
    return ok(undefined);
  }

  async classify(input: InferenceInput): Promise<Result<Classification>> {
    return ok(classifyFeatures(input.features, this.id, this.modelVersion, input.priors));
  }

  dispose(): void {
    /* stateless */
  }
}

export function classifyFeatures(
  f: AcousticFeatures,
  engineId: string,
  modelVersion: string,
  priors?: CatPriors,
): Classification {
  const raw: Record<string, number> = {
    purr: scorePurr(f),
    hiss: scoreHiss(f),
    growl: scoreGrowl(f),
    meow: scoreMeow(f),
    trill: scoreTrill(f),
    yowl: scoreYowl(f),
  };

  // Softmax-like normalization with an "unknown" mass tied to total evidence:
  // when nothing scores well, unknown dominates — by design.
  const evidence = Object.values(raw);
  const maxEvidence = Math.max(...evidence);
  const unknownMass = Math.max(0.08, 1 - maxEvidence) ** 2;

  // Softmax temperature calibrated against the contract thresholds: with
  // TEMP=4.5, unambiguous evidence (score ≥ ~0.8) lands above the 0.45 "low"
  // threshold, while genuinely mixed evidence still falls into the unknown
  // policy. The top1−top2 ambiguity margin remains the safety net.
  const TEMP = 4.5;
  const expScores = Object.entries(raw).map(([cls, s]) => [cls, Math.exp(TEMP * s)] as const);
  const unknownExp = Math.exp(TEMP * Math.sqrt(unknownMass));
  const total = expScores.reduce((acc, [, v]) => acc + v, unknownExp);

  const scores: ClassScore[] = [
    ...expScores.map(([cls, v]) => ({
      cls: cls as ClassScore["cls"],
      probability: v / total,
    })),
    { cls: "unknown", probability: unknownExp / total },
  ];

  // Blend in the cat's learned priors (no-op until corrections accumulate),
  // then apply the same unknown policy as the ONNX engine (contract) so both
  // engines behave identically at the product boundary.
  const finalScores = priors ? applyCatPriors(scores, priors) : scores;
  return applyUnknownPolicy(buildClassification(finalScores, engineId, modelVersion));
}

/* --- scoring helpers: each returns 0..1 ------------------------------- */

/** Triangular membership: 1 inside [lo,hi], linear falloff over `soft`. */
function range(x: number | null, lo: number, hi: number, soft: number): number {
  if (x === null) return 0;
  if (x >= lo && x <= hi) return 1;
  if (x < lo) return Math.max(0, 1 - (lo - x) / soft);
  return Math.max(0, 1 - (x - hi) / soft);
}

function scorePurr(f: AcousticFeatures): number {
  const am = range(f.amRateHz, 18, 42, 12) * f.amStrength;
  const dark = range(f.spectralCentroidHz, 0, 1200, 800);
  const sustained = range(f.durationS, 0.8, 10, 0.6);
  const unvoicedOk = 1 - 0.5 * f.voicedRatio; // purrs rarely track a clear mid f0
  return am * 0.55 + dark * 0.2 * sustained + sustained * 0.15 * am + unvoicedOk * 0.1 * am;
}

function scoreHiss(f: AcousticFeatures): number {
  const noisy = range(f.spectralFlatness, 0.25, 1, 0.15);
  const unvoiced = 1 - f.voicedRatio;
  const bright = range(f.spectralCentroidHz, 2000, 8000, 1200);
  const shortish = range(f.durationS, 0.2, 2.5, 1);
  return noisy * 0.4 + unvoiced * 0.3 + bright * 0.2 + shortish * 0.1;
}

function scoreGrowl(f: AcousticFeatures): number {
  const lowPitch = range(f.f0Hz, 50, 250, 120);
  const voiced = range(f.voicedRatio, 0.4, 1, 0.3);
  const dark = range(f.spectralCentroidHz, 0, 1500, 900);
  const sustained = range(f.durationS, 0.5, 8, 0.4);
  return lowPitch * 0.4 + voiced * 0.2 + dark * 0.2 + sustained * 0.2;
}

function scoreMeow(f: AcousticFeatures): number {
  const pitch = range(f.f0Hz, 250, 800, 180);
  const voiced = range(f.voicedRatio, 0.5, 1, 0.3);
  const tonal = range(f.spectralFlatness, 0, 0.2, 0.15);
  const duration = range(f.durationS, 0.3, 2, 0.8);
  return pitch * 0.4 + voiced * 0.25 + tonal * 0.15 + duration * 0.2;
}

function scoreTrill(f: AcousticFeatures): number {
  const pitch = range(f.f0Hz, 250, 900, 200);
  const modulated = range(f.f0RangeHz, 120, 600, 100);
  const short = range(f.durationS, 0.2, 1, 0.5);
  const voiced = range(f.voicedRatio, 0.5, 1, 0.3);
  return pitch * 0.25 + modulated * 0.35 + short * 0.2 + voiced * 0.2;
}

function scoreYowl(f: AcousticFeatures): number {
  const long = range(f.durationS, 1.5, 10, 0.8);
  const pitch = range(f.f0Hz, 200, 700, 200);
  const excursion = range(f.f0RangeHz, 150, 800, 120);
  const voiced = range(f.voicedRatio, 0.5, 1, 0.3);
  return long * 0.4 + pitch * 0.2 + excursion * 0.2 + voiced * 0.2;
}
