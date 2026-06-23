import type { CatId } from "../shared/ids";

export type CatSex = "female" | "male" | "unknown";

/** Visual styles for the downloadable presentation card. */
export const CARD_TEMPLATES = ["classic", "playful", "elegant"] as const;
export type CardTemplate = (typeof CARD_TEMPLATES)[number];

export interface Cat {
  readonly id: CatId;
  readonly name: string;
  /** Birth year (approx). Age matters: kitten vs senior vocal profiles differ. */
  readonly birthYear: number | null;
  /** Exact birth date (ISO yyyy-mm-dd) when known; enables precise age + horoscope. */
  readonly birthDate: string | null;
  readonly breed: string | null;
  readonly sex: CatSex;
  /** Free-form traits chosen by the user, e.g. "talkative", "shy". */
  readonly traits: readonly string[];
  /** ISO 11784/11785 microchip number (15 digits), if known. */
  readonly microchip: string | null;
  /** Short blurb shown on the presentation card. */
  readonly bio: string | null;
  /** Chosen presentation-card design. */
  readonly cardTemplate: CardTemplate;
  /** Whether the card includes the (birth-date-derived) horoscope. */
  readonly showHoroscope: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CatDraft {
  readonly name: string;
  readonly birthYear?: number | null;
  readonly birthDate?: string | null;
  readonly breed?: string | null;
  readonly sex?: CatSex;
  readonly traits?: readonly string[];
  readonly microchip?: string | null;
  readonly bio?: string | null;
  readonly cardTemplate?: CardTemplate;
  readonly showHoroscope?: boolean;
}

const MAX_NAME_LENGTH = 60;
export const MAX_BIO_LENGTH = 280;
/** ISO 11784/11785 transponder code: exactly 15 decimal digits. */
const MICROCHIP_RE = /^\d{15}$/;

export function isValidMicrochip(value: string): boolean {
  return MICROCHIP_RE.test(value);
}

export function validateCatDraft(draft: CatDraft): string | null {
  const name = draft.name.trim();
  if (name.length === 0) return "cat/name-required";
  if (name.length > MAX_NAME_LENGTH) return "cat/name-too-long";
  const year = draft.birthYear ?? null;
  if (year !== null && (year < 1985 || year > new Date().getFullYear())) {
    return "cat/invalid-birth-year";
  }
  const date = draft.birthDate?.trim();
  if (date) {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime()) || parsed.getFullYear() < 1985 || parsed.getTime() > Date.now()) {
      return "cat/invalid-birth-date";
    }
  }
  const chip = draft.microchip?.trim();
  if (chip && !isValidMicrochip(chip)) return "cat/invalid-microchip";
  if (draft.bio && draft.bio.length > MAX_BIO_LENGTH) return "cat/bio-too-long";
  return null;
}

/**
 * Age in whole years, preferring the exact birth date (accounts for the
 * month/day) and falling back to the approximate birth year. Null when unknown.
 */
export function catAgeYears(cat: Pick<Cat, "birthDate" | "birthYear">): number | null {
  if (cat.birthDate) {
    const d = new Date(cat.birthDate);
    if (!Number.isNaN(d.getTime())) {
      const now = new Date();
      let age = now.getFullYear() - d.getFullYear();
      const monthDelta = now.getMonth() - d.getMonth();
      if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < d.getDate())) age--;
      return age >= 0 ? age : null;
    }
  }
  if (cat.birthYear) return Math.max(0, new Date().getFullYear() - cat.birthYear);
  return null;
}

/**
 * Fill card/profile defaults on a cat read from storage. Cats created before
 * these fields existed lack them; normalizing on read keeps the rest of the app
 * type-safe without a data migration.
 */
export function normalizeCat(cat: Cat): Cat {
  return {
    ...cat,
    birthDate: cat.birthDate ?? null,
    breed: cat.breed ?? null,
    traits: cat.traits ?? [],
    microchip: cat.microchip ?? null,
    bio: cat.bio ?? null,
    cardTemplate: cat.cardTemplate ?? "classic",
    showHoroscope: cat.showHoroscope ?? false,
  };
}
