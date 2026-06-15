import { describe, it, expect } from "vitest";
import { validateCatDraft } from "@/domain/cat/cat";
import { validateFeedback } from "@/domain/feedback/feedback";

describe("cat validation", () => {
  it("requires a non-empty name", () => {
    expect(validateCatDraft({ name: "  " })).toBe("cat/name-required");
  });
  it("rejects an implausible birth year", () => {
    expect(validateCatDraft({ name: "Mishi", birthYear: 1900 })).toBe("cat/invalid-birth-year");
  });
  it("accepts a valid draft", () => {
    expect(validateCatDraft({ name: "Mishi", birthYear: 2020 })).toBeNull();
  });
});

describe("feedback validation", () => {
  it("requires a correction when the verdict is not 'correct'", () => {
    expect(validateFeedback("incorrect", null)).toBe("feedback/correction-required");
  });
  it("allows a bare 'correct' verdict", () => {
    expect(validateFeedback("correct", null)).toBeNull();
  });
});
