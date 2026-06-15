import { z } from "zod";
import { VOCALIZATION_CLASSES } from "@/domain/analysis/vocalization";

/**
 * Zod schemas validate EVERY request body at the trust boundary.
 * Domain types are the source of truth; these mirror them for the wire.
 */
export const acousticFeaturesSchema = z.object({
  durationS: z.number().nonnegative(),
  rms: z.number(),
  f0Hz: z.number().nullable(),
  f0StartHz: z.number().nullable(),
  f0EndHz: z.number().nullable(),
  f0RangeHz: z.number(),
  voicedRatio: z.number().min(0).max(1),
  spectralCentroidHz: z.number(),
  spectralFlatness: z.number(),
  zeroCrossingRate: z.number(),
  amRateHz: z.number().nullable(),
  amStrength: z.number(),
});

export const syncSessionSchema = z.object({
  id: z.string().uuid(),
  catId: z.string().uuid().nullable(),
  createdAt: z.number().int(),
  source: z.enum(["microphone", "file"]),
  recordingDurationS: z.number().nonnegative(),
  segment: z.object({
    startS: z.number().nonnegative(),
    endS: z.number().nonnegative(),
    features: acousticFeaturesSchema,
  }),
  classification: z.object({
    primary: z.object({
      cls: z.enum(VOCALIZATION_CLASSES),
      probability: z.number().min(0).max(1),
    }),
    alternatives: z.array(
      z.object({ cls: z.enum(VOCALIZATION_CLASSES), probability: z.number() }),
    ),
    certainty: z.enum(["high", "medium", "low"]),
    ambiguous: z.boolean(),
    engineId: z.string(),
    modelVersion: z.string(),
  }),
});

export const analyticsBatchSchema = z.object({
  events: z
    .array(
      z.object({
        name: z.string().max(64),
        props: z.record(z.string(), z.unknown()).default({}),
        ts: z.number().int(),
      }),
    )
    .max(50),
});

export type SyncSessionInput = z.infer<typeof syncSessionSchema>;
