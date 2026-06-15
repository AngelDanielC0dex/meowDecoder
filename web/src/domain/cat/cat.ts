import type { CatId } from "../shared/ids";

export type CatSex = "female" | "male" | "unknown";

export interface Cat {
  readonly id: CatId;
  readonly name: string;
  /** Birth year (approx). Age matters: kitten vs senior vocal profiles differ. */
  readonly birthYear: number | null;
  readonly breed: string | null;
  readonly sex: CatSex;
  /** Free-form traits chosen by the user, e.g. "talkative", "shy". */
  readonly traits: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CatDraft {
  readonly name: string;
  readonly birthYear?: number | null;
  readonly breed?: string | null;
  readonly sex?: CatSex;
  readonly traits?: readonly string[];
}

const MAX_NAME_LENGTH = 60;

export function validateCatDraft(draft: CatDraft): string | null {
  const name = draft.name.trim();
  if (name.length === 0) return "cat/name-required";
  if (name.length > MAX_NAME_LENGTH) return "cat/name-too-long";
  const year = draft.birthYear ?? null;
  if (year !== null && (year < 1985 || year > new Date().getFullYear())) {
    return "cat/invalid-birth-year";
  }
  return null;
}
