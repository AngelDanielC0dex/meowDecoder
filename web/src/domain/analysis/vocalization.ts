/**
 * Vocalization taxonomy v2 — 11 emotional/behavioral states.
 *
 * SINGLE SOURCE OF TRUTH: MODEL_OUTPUT_CLASSES in contract.ts defines the
 * canonical 11-class list (model output order). VOCALIZATION_CLASSES adds
 * "unknown" (a product-level policy, not a model output) and is the type
 * used throughout the UI.  Never duplicate the class list elsewhere.
 */
import { MODEL_OUTPUT_CLASSES } from "./contract";

export const VOCALIZATION_CLASSES = [...MODEL_OUTPUT_CLASSES, "unknown"] as const;

export type VocalizationClass = (typeof VOCALIZATION_CLASSES)[number];

export const isVocalizationClass = (v: string): v is VocalizationClass =>
  (VOCALIZATION_CLASSES as readonly string[]).includes(v);

/** Classes a user can assign when correcting a prediction (everything but unknown). */
export const CORRECTABLE_CLASSES = VOCALIZATION_CLASSES.filter(
  (c): c is Exclude<VocalizationClass, "unknown"> => c !== "unknown",
);