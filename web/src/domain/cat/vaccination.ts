import type { CatId } from "../shared/ids";

/**
 * A single administered-vaccine record for a cat (the local half of the medical
 * log). The catalog/requirements live in `content/vaccines.ts`; this is just the
 * user's factual record of what was given and when.
 */
export interface VaccinationRecord {
  readonly id: string;
  readonly catId: CatId;
  /** References a VaccineDef.id from the catalog. */
  readonly vaccineId: string;
  readonly administeredOn: number; // epoch ms
  readonly nextDueOn: number | null;
  readonly notes: string | null;
}

export type VaccinationDraft = Omit<VaccinationRecord, "id">;
