import { describe, it, expect } from "vitest";
import { encodeCardShare, decodeCardShare, type CardSharePayload } from "@/domain/cat/card-share";

describe("card share codec", () => {
  it("round-trips a payload, including UTF-8 names and emoji", () => {
    const p: CardSharePayload = {
      n: "Mishü ñ",
      d: "2022-03-21",
      b: "Le gusta el sol ☀️",
      t: "elegant",
      h: true,
    };
    expect(decodeCardShare(encodeCardShare(p))).toEqual(p);
  });

  it("returns null for malformed input or an empty name", () => {
    expect(decodeCardShare("not base64 !!")).toBeNull();
    const empty = encodeCardShare({ n: "", d: null, b: null, t: "classic", h: false });
    expect(decodeCardShare(empty)).toBeNull();
  });

  it("sanitizes tampered payloads (unknown template → classic, bio clamped)", () => {
    const enc = encodeCardShare({ n: "Cat", d: null, b: "x".repeat(400), t: "weird" as never, h: false });
    const out = decodeCardShare(enc);
    expect(out).not.toBeNull();
    expect(out!.t).toBe("classic");
    expect(out!.b).toHaveLength(280);
  });
});
