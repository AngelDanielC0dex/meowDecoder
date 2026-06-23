import type { Cat, CardTemplate } from "./cat";
import { CARD_TEMPLATES } from "./cat";

/**
 * Compact, URL-embeddable representation of a presentation card. The photo is a
 * local blob and intentionally NOT included (it would not fit in a URL/QR); a
 * shared card reconstructs everything else from these fields. Keys are short to
 * keep the encoded string (and therefore the QR) small.
 */
export interface CardSharePayload {
  /** name */ readonly n: string;
  /** birthDate ISO, or null */ readonly d: string | null;
  /** bio, or null */ readonly b: string | null;
  /** template */ readonly t: CardTemplate;
  /** showHoroscope */ readonly h: boolean;
}

export function payloadFromCat(cat: Cat): CardSharePayload {
  return { n: cat.name, d: cat.birthDate, b: cat.bio, t: cat.cardTemplate, h: cat.showHoroscope };
}

// UTF-8-safe base64url (works in browser, edge and Node: btoa/atob + TextEncoder
// are all standard there). Avoids `+`, `/`, `=` so it is URL- and QR-clean.
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeCardShare(payload: CardSharePayload): string {
  return toBase64Url(JSON.stringify(payload));
}

/** Parses a shared payload, returning null on any malformed/forged input. */
export function decodeCardShare(encoded: string): CardSharePayload | null {
  try {
    const raw = JSON.parse(fromBase64Url(encoded)) as Partial<CardSharePayload>;
    if (typeof raw.n !== "string" || raw.n.length === 0 || raw.n.length > 60) return null;
    const template = CARD_TEMPLATES.includes(raw.t as CardTemplate) ? (raw.t as CardTemplate) : "classic";
    return {
      n: raw.n,
      d: typeof raw.d === "string" ? raw.d : null,
      b: typeof raw.b === "string" ? raw.b.slice(0, 280) : null,
      t: template,
      h: raw.h === true,
    };
  } catch {
    return null;
  }
}

/** Absolute URL of the public card view for a payload. */
export function buildCardShareUrl(origin: string, locale: string, payload: CardSharePayload): string {
  return `${origin}/${locale}/card?d=${encodeCardShare(payload)}`;
}
