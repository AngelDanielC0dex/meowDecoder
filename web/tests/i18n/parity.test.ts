import { describe, it, expect } from "vitest";
import en from "@/i18n/messages/en.json";
import es from "@/i18n/messages/es.json";

/**
 * Guards against i18n drift: every message key must exist in BOTH locales.
 * A missing key surfaces at runtime as a broken string, so we fail the build
 * instead. Compares the full set of dotted leaf keys.
 */
function collectKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out.push(...collectKeys(v as Record<string, unknown>, key));
    } else {
      out.push(key);
    }
  }
  return out;
}

describe("i18n locale parity", () => {
  const enKeys = collectKeys(en as Record<string, unknown>).sort();
  const esKeys = collectKeys(es as Record<string, unknown>).sort();

  it("en and es expose exactly the same keys", () => {
    const onlyEn = enKeys.filter((k) => !esKeys.includes(k));
    const onlyEs = esKeys.filter((k) => !enKeys.includes(k));
    expect({ onlyEn, onlyEs }).toEqual({ onlyEn: [], onlyEs: [] });
  });
});
