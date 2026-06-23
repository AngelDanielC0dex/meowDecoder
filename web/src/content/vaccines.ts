import type { AppLocale } from "@/i18n/routing";

/**
 * Feline vaccine catalog with per-region requirement levels.
 *
 * IMPORTANT (honesty): legally MANDATORY vaccination for cats is essentially
 * limited to RABIES, and even that varies by jurisdiction (e.g. required for
 * EU pet travel; many US states). The "core" set (FVRCP) is a WSAVA medical
 * RECOMMENDATION, not law. So we model two orthogonal axes:
 *   - `level`: WSAVA medical guidance — "core" | "non-core".
 *   - `region`: legal/practical requirement per region — used by the UI selector.
 * ⚠️ The region rules below are a sensible default and MUST be verified against
 *    the user's actual jurisdiction before being treated as legal advice.
 */
export type VaccineRegion = "eu" | "us" | "other";
export type RequirementLevel = "legal_required" | "recommended" | "optional";

export interface VaccineDef {
  readonly id: string;
  readonly name: Record<AppLocale, string>;
  /** WSAVA classification. */
  readonly level: "core" | "non-core";
  readonly region: Record<VaccineRegion, RequirementLevel>;
}

export const VACCINE_REGIONS: readonly VaccineRegion[] = ["eu", "us", "other"];

export const VACCINES: readonly VaccineDef[] = [
  {
    id: "fvrcp",
    name: { es: "Trivalente felina (FVRCP)", en: "Feline trivalent (FVRCP)" },
    level: "core",
    region: { eu: "recommended", us: "recommended", other: "recommended" },
  },
  {
    id: "rabies",
    name: { es: "Rabia", en: "Rabies" },
    level: "non-core",
    region: { eu: "legal_required", us: "legal_required", other: "recommended" },
  },
  {
    id: "felv",
    name: { es: "Leucemia felina (FeLV)", en: "Feline leukemia (FeLV)" },
    level: "non-core",
    region: { eu: "recommended", us: "recommended", other: "recommended" },
  },
  {
    id: "chlamydia",
    name: { es: "Clamidia", en: "Chlamydia" },
    level: "non-core",
    region: { eu: "optional", us: "optional", other: "optional" },
  },
  {
    id: "bordetella",
    name: { es: "Bordetella", en: "Bordetella" },
    level: "non-core",
    region: { eu: "optional", us: "optional", other: "optional" },
  },
];

export function requirementFor(vaccine: VaccineDef, region: VaccineRegion): RequirementLevel {
  return vaccine.region[region];
}
