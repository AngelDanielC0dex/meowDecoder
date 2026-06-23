/**
 * Western zodiac sign from a birth date. Pure + deterministic so it can be unit
 * tested at the date boundaries. The per-sign name and a playful, cat-flavoured
 * character phrase are looked up by the UI through i18n (namespace `zodiac`),
 * keyed by the sign id returned here.
 */
export const ZODIAC_SIGNS = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
] as const;

export type ZodiacSign = (typeof ZODIAC_SIGNS)[number];

export const ZODIAC_EMOJI: Record<ZodiacSign, string> = {
  aries: "♈",
  taurus: "♉",
  gemini: "♊",
  cancer: "♋",
  leo: "♌",
  virgo: "♍",
  libra: "♎",
  scorpio: "♏",
  sagittarius: "♐",
  capricorn: "♑",
  aquarius: "♒",
  pisces: "♓",
};

/** Returns the zodiac sign for an ISO date (yyyy-mm-dd), or null if invalid. */
export function zodiacSignForDate(iso: string | null): ZodiacSign | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const span = (m1: number, d1: number, m2: number, d2: number): boolean =>
    (month === m1 && day >= d1) || (month === m2 && day <= d2);

  if (span(3, 21, 4, 19)) return "aries";
  if (span(4, 20, 5, 20)) return "taurus";
  if (span(5, 21, 6, 20)) return "gemini";
  if (span(6, 21, 7, 22)) return "cancer";
  if (span(7, 23, 8, 22)) return "leo";
  if (span(8, 23, 9, 22)) return "virgo";
  if (span(9, 23, 10, 22)) return "libra";
  if (span(10, 23, 11, 21)) return "scorpio";
  if (span(11, 22, 12, 21)) return "sagittarius";
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return "capricorn";
  if (span(1, 20, 2, 18)) return "aquarius";
  return "pisces"; // 2/19 – 3/20
}
