import { CORRECTABLE_CLASSES, type VocalizationClass } from "./vocalization";
import type { ClassScore } from "./classification";

/**
 * Per-cat learned priors — the local half of the "improves with use" loop.
 *
 * Each cat accumulates Dirichlet alpha counts over the 10 correctable classes:
 * every time the user corrects a prediction for that cat, the corrected class
 * gains weight. At inference time we blend these priors into the engine's score
 * distribution BEFORE certainty is derived, so a cat's idiosyncratic sounds
 * gradually shift ambiguous calls — without overriding strong, clear evidence.
 *
 * Starts uniform (all alphas = 1) so a brand-new cat behaves exactly like the
 * global model: priors only matter once real corrections exist.
 *
 * SAFETY: the per-class multiplier is hard-clamped to [FACTOR_MIN, FACTOR_MAX].
 * Without that bound the multiplier grows unbounded as corrections accumulate
 * and could flip a confident, acoustically-clear prediction (e.g. a sharp hiss)
 * into the cat's most-corrected class. The clamp guarantees priors only ever
 * *nudge* — at most doubling or halving a score — so clear evidence always wins
 * while ambiguous calls still adapt to the individual cat.
 */
export type CorrectableClass = Exclude<VocalizationClass, "unknown">;
export type CatPriors = Record<CorrectableClass, number>;

/** How strongly priors pull predictions. 0 = ignore, 1 = full multiply. Gentle. */
const PRIOR_STRENGTH = 0.5;
/** Hard bounds on the per-class multiplier so priors can never dominate. */
const FACTOR_MIN = 0.5;
const FACTOR_MAX = 2.0;

export function emptyCatPriors(): CatPriors {
  const priors = {} as CatPriors;
  for (const cls of CORRECTABLE_CLASSES) priors[cls] = 1;
  return priors;
}

export function reinforceCatPriors(
  priors: CatPriors,
  cls: CorrectableClass,
  weight = 1,
): CatPriors {
  return { ...priors, [cls]: (priors[cls] ?? 1) + weight };
}

/**
 * Blend engine scores with a cat's priors and renormalize. `unknown` mass is
 * carried through unchanged before renormalization, preserving the honest
 * low-confidence behavior. A no-op while priors are uniform.
 */
export function applyCatPriors(
  scores: readonly ClassScore[],
  priors: CatPriors,
): ClassScore[] {
  const totalAlpha = CORRECTABLE_CLASSES.reduce((sum, c) => sum + (priors[c] ?? 1), 0);
  const uniform = 1 / CORRECTABLE_CLASSES.length;

  const weighted = scores.map((s) => {
    if (s.cls === "unknown") return { cls: s.cls, probability: s.probability };
    const mean = (priors[s.cls as CorrectableClass] ?? 1) / totalAlpha;
    const raw = 1 + PRIOR_STRENGTH * (mean / uniform - 1);
    const factor = Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, raw)); // clamp: only nudge
    return { cls: s.cls, probability: Math.max(0, s.probability * factor) };
  });

  const sum = weighted.reduce((acc, x) => acc + x.probability, 0) || 1;
  return weighted.map((x) => ({ cls: x.cls, probability: x.probability / sum }));
}
