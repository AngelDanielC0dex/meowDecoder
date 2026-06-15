/**
 * Vocalization taxonomy v1.
 *
 * Classes are chosen to be (a) acoustically separable, (b) meaningful to users,
 * (c) supported by feline bioacoustics literature (Schötz et al., Tavernier et al.).
 * `unknown` is a first-class citizen: when the signal is ambiguous the product
 * says so instead of guessing.
 */
export const VOCALIZATION_CLASSES = [
  "meow",
  "purr",
  "trill",
  "hiss",
  "growl",
  "yowl",
  "unknown",
] as const;

export type VocalizationClass = (typeof VOCALIZATION_CLASSES)[number];

export const isVocalizationClass = (v: string): v is VocalizationClass =>
  (VOCALIZATION_CLASSES as readonly string[]).includes(v);

/** Classes a user can assign when correcting a prediction (everything but unknown). */
export const CORRECTABLE_CLASSES = VOCALIZATION_CLASSES.filter(
  (c): c is Exclude<VocalizationClass, "unknown"> => c !== "unknown",
);
