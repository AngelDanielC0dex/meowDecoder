import { describe, it, expect } from "vitest";
import { zodiacSignForDate } from "@/domain/cat/zodiac";
import { catAgeYears } from "@/domain/cat/cat";

describe("zodiacSignForDate", () => {
  it("maps dates to the correct sign, including cusp boundaries", () => {
    expect(zodiacSignForDate("2022-03-21")).toBe("aries"); // first day of aries
    expect(zodiacSignForDate("2022-04-19")).toBe("aries"); // last day of aries
    expect(zodiacSignForDate("2022-04-20")).toBe("taurus"); // taurus begins
    expect(zodiacSignForDate("2022-07-23")).toBe("leo");
    expect(zodiacSignForDate("2022-02-19")).toBe("pisces");
  });

  it("handles capricorn wrapping across the year boundary", () => {
    expect(zodiacSignForDate("2022-12-25")).toBe("capricorn");
    expect(zodiacSignForDate("2022-01-10")).toBe("capricorn");
    expect(zodiacSignForDate("2022-01-20")).toBe("aquarius");
  });

  it("returns null for missing or invalid dates", () => {
    expect(zodiacSignForDate(null)).toBeNull();
    expect(zodiacSignForDate("not-a-date")).toBeNull();
  });
});

describe("catAgeYears", () => {
  it("prefers the exact birth date over the birth year", () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 3);
    expect(catAgeYears({ birthDate: d.toISOString().slice(0, 10), birthYear: null })).toBe(3);
  });

  it("falls back to the birth year when no date is set", () => {
    expect(catAgeYears({ birthDate: null, birthYear: new Date().getFullYear() - 5 })).toBe(5);
  });

  it("is null when neither is known", () => {
    expect(catAgeYears({ birthDate: null, birthYear: null })).toBeNull();
  });
});
