import { describe, it, expect } from "vitest";
import { isValidMicrochip, validateCatDraft } from "@/domain/cat/cat";

describe("microchip (ISO 11784/11785)", () => {
  it("accepts exactly 15 digits", () => {
    expect(isValidMicrochip("123456789012345")).toBe(true);
  });

  it("rejects wrong length or non-digits", () => {
    expect(isValidMicrochip("123")).toBe(false);
    expect(isValidMicrochip("1234567890123456")).toBe(false);
    expect(isValidMicrochip("12345678901234a")).toBe(false);
    expect(isValidMicrochip("")).toBe(false);
  });

  it("validateCatDraft flags an invalid microchip but allows none", () => {
    expect(validateCatDraft({ name: "Mimi" })).toBeNull();
    expect(validateCatDraft({ name: "Mimi", microchip: "123" })).toBe("cat/invalid-microchip");
    expect(validateCatDraft({ name: "Mimi", microchip: "123456789012345" })).toBeNull();
  });
});
