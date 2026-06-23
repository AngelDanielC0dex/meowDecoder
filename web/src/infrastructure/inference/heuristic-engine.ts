import type { InferenceEngine, InferenceInput } from "@/application/ports/inference-engine";
import { buildClassification, type ClassScore } from "@/domain/analysis/classification";
import { applyCatPriors, type CatPriors } from "@/domain/analysis/cat-priors";
import { applyUnknownPolicy } from "@/domain/analysis/contract";
import type { AcousticFeatures } from "@/domain/analysis/features";
import type { Classification } from "@/domain/analysis/classification";
import { ok, type Result } from "@/domain/shared/result";

/**
 * Engine v2: rule-based scoring over acoustic features — 10 emotional states.
 *
 * Each class scores 0..1 from acoustically grounded evidence.
 * The 10-class taxonomy maps to measurable acoustic properties:
 *
 *   feliz_contento:      affiliative meow, flat/gentle contour, low AM
 *   trinos:              short, modulated f0, voiced, rising contour (incl. hunting chatter)
 *   enfadado:            low f0 growl, voiced, dark spectrum
 *   pelea:               high intensity, transients, multiple harmonics
 *   llamada_madre:       descending melodic, moderate duration, voiced
 *   llamada_apareamiento: long, wide f0 excursion, intense (yowl)
 *   dolor:               high f0 distress, urgent, strained harmonics
 *   descansando:          continuous low purr, very dark, minimal variation
 *   advertencia:         broadband noise (hiss), unvoiced, bright
 *   atencion:            harmonic meow, ascending contour, moderate duration
 *
 * Scores are normalized into a distribution; the shared domain logic decides
 * certainty/ambiguity exactly as it will for the YAMNet model. Honest by
 * construction: weak evidence yields a low-confidence `unknown`.
 */
export class HeuristicEngine implements InferenceEngine {
  readonly id = "heuristic-dsp";
  readonly modelVersion = "heuristic-2.0.0";

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
    feliz_contento: scoreFeliz(f),
    trinos: scoreTrinos(f),
    enfadado: scoreEnfadado(f),
    pelea: scorePelea(f),
    llamada_madre: scoreLlamadaMadre(f),
    llamada_apareamiento: scoreLlamadaApareamiento(f),
    dolor: scoreDolor(f),
    descansando: scoreDescansando(f),
    advertencia: scoreAdvertencia(f),
    atencion: scoreAtencion(f),
  };

  const evidence = Object.values(raw);
  const maxEvidence = Math.max(...evidence);
  const unknownMass = Math.max(0.08, 1 - maxEvidence) ** 2;

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

  const finalScores = priors ? applyCatPriors(scores, priors) : scores;
  return applyUnknownPolicy(buildClassification(finalScores, engineId, modelVersion));
}

function range(x: number | null, lo: number, hi: number, soft: number): number {
  if (x === null) return 0;
  if (x >= lo && x <= hi) return 1;
  if (x < lo) return Math.max(0, 1 - (lo - x) / soft);
  return Math.max(0, 1 - (x - hi) / soft);
}

/**
 * Direction helpers: measure whether f0 rises or falls across the segment.
 * Returns 0..1 where 1 = strongly ascending/descending, 0 = flat or null.
 */
function f0Ascending(f: AcousticFeatures): number {
  if (f.f0StartHz === null || f.f0EndHz === null || f.f0RangeHz === 0) return 0;
  const rise = f.f0EndHz - f.f0StartHz;
  return Math.max(0, rise / f.f0RangeHz);
}

function f0Descending(f: AcousticFeatures): number {
  if (f.f0StartHz === null || f.f0EndHz === null || f.f0RangeHz === 0) return 0;
  const fall = f.f0StartHz - f.f0EndHz;
  return Math.max(0, fall / f.f0RangeHz);
}

function scoreFeliz(f: AcousticFeatures): number {
  // Affiliative meow (CatMeows "brushing"): voiced, harmonic, flat or gently
  // descending pitch, moderate f0 and energy, low AM (high AM → descansando),
  // not urgently ascending (demand cry with strong ascent → atencion).
  const voiced = range(f.voicedRatio, 0.45, 1, 0.3);
  const midPitch = range(f.f0Hz, 250, 650, 200);
  const moderateDuration = range(f.durationS, 0.3, 3, 1);
  const moderateEnergy = range(f.spectralCentroidHz, 500, 3000, 800);
  const tonal = range(f.spectralFlatness, 0, 0.2, 0.15);
  const purrPenalty = 1 - (f.amStrength > 0.3 ? 0.6 : 0);
  const unvoicedPenalty = 1 - range(f.voicedRatio, 0, 0.3, 0.3) * 0.6;
  const notAscendingPenalty = 1 - f0Ascending(f) * 0.7;
  return (voiced * 0.28 + midPitch * 0.22 + moderateDuration * 0.18 +
          moderateEnergy * 0.18 + tonal * 0.14) *
         purrPenalty * unvoicedPenalty * notAscendingPenalty;
}

function scoreTrinos(f: AcousticFeatures): number {
  const short = range(f.durationS, 0.1, 0.8, 0.3);
  const modulated = range(f.f0RangeHz, 100, 600, 150);
  const midHighPitch = range(f.f0Hz, 350, 900, 200);
  const voiced = range(f.voicedRatio, 0.5, 1, 0.3);
  const tonal = range(f.spectralFlatness, 0, 0.15, 0.1);
  const longPenalty = 1 - range(f.durationS, 1.2, 4, 1.5) * 0.6;
  return (short * 0.35 + modulated * 0.25 + midHighPitch * 0.15 + voiced * 0.15 + tonal * 0.1) * longPenalty;
}

function scoreEnfadado(f: AcousticFeatures): number {
  const lowPitch = range(f.f0Hz, 50, 280, 150);
  const voiced = range(f.voicedRatio, 0.4, 1, 0.3);
  const dark = range(f.spectralCentroidHz, 0, 1600, 800);
  const sustained = range(f.durationS, 0.3, 5, 0.5);
  const lowFlatness = range(f.spectralFlatness, 0, 0.15, 0.1);
  const highPitchPenalty = 1 - range(f.f0Hz, 400, 1200, 300) * 0.5;
  const amPenalty = 1 - (f.amStrength > 0.3 ? 0.5 : 0);
  return (lowPitch * 0.3 + voiced * 0.2 + dark * 0.2 + sustained * 0.2 + lowFlatness * 0.1) * highPitchPenalty * amPenalty;
}

function scorePelea(f: AcousticFeatures): number {
  const highIntensity = range(f.f0Hz, 300, 900, 200);
  const wideRange = range(f.f0RangeHz, 250, 800, 150);
  const mixedVoiced = range(f.voicedRatio, 0.3, 0.7, 0.3);
  const moderateFlatness = range(f.spectralFlatness, 0.1, 0.5, 0.15);
  const abrupt = range(f.durationS, 0.3, 3, 1);
  const tonalPenalty = 1 - range(f.spectralFlatness, 0, 0.08, 0.05) * 0.6;
  const fullyVoicedPenalty = 1 - range(f.voicedRatio, 0.8, 1, 0.15) * 0.4;
  return (wideRange * 0.3 + highIntensity * 0.2 + moderateFlatness * 0.2 + mixedVoiced * 0.15 + abrupt * 0.15) * tonalPenalty * fullyVoicedPenalty;
}

function scoreLlamadaMadre(f: AcousticFeatures): number {
  const descending = f0Descending(f);
  const moderatePitch = range(f.f0Hz, 250, 650, 200);
  const voiced = range(f.voicedRatio, 0.5, 1, 0.3);
  const moderateDuration = range(f.durationS, 0.3, 2, 0.8);
  const tonal = range(f.spectralFlatness, 0, 0.2, 0.15);
  const ascendingPenalty = 1 - f0Ascending(f) * 0.6;
  const amPenalty = 1 - (f.amStrength > 0.3 ? 0.3 : 0);
  return (descending * 0.4 + moderatePitch * 0.2 + voiced * 0.15 + moderateDuration * 0.1 + tonal * 0.15) * ascendingPenalty * amPenalty;
}

function scoreLlamadaApareamiento(f: AcousticFeatures): number {
  const long = range(f.durationS, 1.5, 10, 1);
  const wideExcursion = range(f.f0RangeHz, 200, 800, 150);
  const pitched = range(f.f0Hz, 250, 800, 200);
  const voiced = range(f.voicedRatio, 0.4, 1, 0.3);
  const shortPenalty = 1 - range(f.durationS, 0, 0.8, 0.4) * 0.6;
  const narrowPenalty = Math.max(0.15, wideExcursion * 0.5 + 0.5 * range(f.f0RangeHz, 100, 300, 100));
  return (long * 0.25 + wideExcursion * 0.3 + pitched * 0.2 + voiced * 0.15) * shortPenalty * narrowPenalty;
}

function scoreDolor(f: AcousticFeatures): number {
  const veryHighPitch = range(f.f0Hz, 600, 1200, 200);
  const strained = range(f.voicedRatio, 0.5, 1, 0.3);
  const urgent = range(f.durationS, 0.3, 3, 0.8);
  const wideRange = range(f.f0RangeHz, 100, 600, 100);
  const harmonicTension = range(f.spectralFlatness, 0, 0.25, 0.15);
  const moderatePitchPenalty = 1 - range(f.f0Hz, 300, 550, 150) * 0.5;
  return (veryHighPitch * 0.3 + strained * 0.2 + urgent * 0.2 + wideRange * 0.15 + harmonicTension * 0.15) * moderatePitchPenalty;
}

function scoreDescansando(f: AcousticFeatures): number {
  const am = range(f.amRateHz, 18, 42, 12) * f.amStrength;
  const veryDark = range(f.spectralCentroidHz, 0, 700, 400);
  const long = range(f.durationS, 1.0, 10, 0.8);
  const stable = 1 - range(f.f0RangeHz, 100, 600, 80) * 0.5;
  const noAmPenalty = am > 0.01 ? 1 : 0.3;
  const moderateEnergyPenalty = 1 - range(f.spectralCentroidHz, 700, 2000, 400) * 0.3;
  return (am * 0.4 + veryDark * 0.25 + long * 0.2 + stable * 0.15) * noAmPenalty * moderateEnergyPenalty;
}

function scoreAdvertencia(f: AcousticFeatures): number {
  const noisy = range(f.spectralFlatness, 0.25, 1, 0.15);
  const unvoiced = 1 - f.voicedRatio;
  const bright = range(f.spectralCentroidHz, 2000, 8000, 1200);
  const shortish = range(f.durationS, 0.2, 2.5, 1);
  const voicedPenalty = 1 - range(f.voicedRatio, 0.5, 1, 0.3) * 0.4;
  return (noisy * 0.35 + unvoiced * 0.25 + bright * 0.2 + shortish * 0.1) * voicedPenalty;
}

function scoreAtencion(f: AcousticFeatures): number {
  const pitch = range(f.f0Hz, 300, 700, 200);
  const ascendingDir = f0Ascending(f);
  const voiced = range(f.voicedRatio, 0.5, 1, 0.3);
  const tonal = range(f.spectralFlatness, 0, 0.15, 0.1);
  const duration = range(f.durationS, 0.3, 2, 0.8);
  const shortPenalty = 1 - range(f.durationS, 0, 0.4, 0.2) * 0.5;
  const descendingPenalty = 1 - f0Descending(f) * 0.4;
  const amPenalty = 1 - (f.amStrength > 0.3 ? 0.4 : 0);
  const highPitchPenalty = 1 - (f.f0Hz !== null && f.f0Hz > 800 ? Math.min(1, (f.f0Hz - 800) / 400) * 0.4 : 0);
  return (ascendingDir * 0.3 + pitch * 0.2 + voiced * 0.2 + tonal * 0.1 + duration * 0.1) * shortPenalty * descendingPenalty * amPenalty * highPitchPenalty;
}