import { describe, it, expect } from "vitest";
import { VACCINES, VACCINE_REGIONS, requirementFor } from "@/content/vaccines";

describe("vaccine catalog", () => {
  it("rabies is legally required in the EU and US", () => {
    const rabies = VACCINES.find((v) => v.id === "rabies");
    expect(rabies).toBeDefined();
    expect(requirementFor(rabies!, "eu")).toBe("legal_required");
    expect(requirementFor(rabies!, "us")).toBe("legal_required");
  });

  it("FVRCP is WSAVA core", () => {
    expect(VACCINES.find((v) => v.id === "fvrcp")?.level).toBe("core");
  });

  it("every vaccine has bilingual names and a rule for every region", () => {
    for (const v of VACCINES) {
      expect(v.name.es.length).toBeGreaterThan(0);
      expect(v.name.en.length).toBeGreaterThan(0);
      for (const region of VACCINE_REGIONS) {
        expect(v.region[region]).toBeTruthy();
      }
    }
  });

  it("vaccine ids are unique", () => {
    const ids = VACCINES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
