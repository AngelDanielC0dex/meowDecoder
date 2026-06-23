import { describe, it, expect } from "vitest";
import { buildClassification } from "@/domain/analysis/classification";

describe("buildClassification", () => {
  it("picks the highest-probability class as primary", () => {
    const c = buildClassification(
      [
        { cls: "atencion", probability: 0.7 },
        { cls: "trinos", probability: 0.2 },
        { cls: "feliz_contento", probability: 0.1 },
      ],
      "e",
      "v",
    );
    expect(c.primary.cls).toBe("atencion");
    expect(c.certainty).toBe("high");
    expect(c.ambiguous).toBe(false);
  });

  it("flags a close top-2 as ambiguous", () => {
    const c = buildClassification(
      [
        { cls: "atencion", probability: 0.42 },
        { cls: "trinos", probability: 0.4 },
      ],
      "e",
      "v",
    );
    expect(c.ambiguous).toBe(true);
  });

  it("treats very low confidence as low certainty", () => {
    const c = buildClassification(
      [
        { cls: "atencion", probability: 0.3 },
        { cls: "feliz_contento", probability: 0.25 },
      ],
      "e",
      "v",
    );
    expect(c.certainty).toBe("low");
    expect(c.ambiguous).toBe(true);
  });

  it("keeps at most two alternatives and drops negligible ones", () => {
    const c = buildClassification(
      [
        { cls: "atencion", probability: 0.6 },
        { cls: "trinos", probability: 0.25 },
        { cls: "feliz_contento", probability: 0.13 },
        { cls: "advertencia", probability: 0.02 },
      ],
      "e",
      "v",
    );
    expect(c.alternatives.length).toBeLessThanOrEqual(2);
    expect(c.alternatives.every((a) => a.probability >= 0.05)).toBe(true);
  });
});