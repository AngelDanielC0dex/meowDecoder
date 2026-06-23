import type { CardTemplate } from "@/domain/cat/cat";

/**
 * Canvas renderer for the downloadable cat presentation card. ONE source of
 * truth for both the on-screen preview and the PNG export (the preview IS a
 * canvas), so they can never diverge, and there is no html-to-image dependency
 * or cross-origin/taint issue (the photo is a local blob drawn directly).
 *
 * It is intentionally i18n-agnostic: the caller passes already-localized strings
 * (age line, born line, horoscope name/phrase…), so this module is pure drawing.
 */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

export interface CardData {
  readonly name: string;
  readonly photo: HTMLImageElement | null;
  /** Already-localized fact lines, e.g. ["3 años", "Nació el 12 mar 2022"]. */
  readonly facts: readonly string[];
  readonly bio: string | null;
  readonly horoscope: { emoji: string; sign: string; phrase: string } | null;
  readonly brand: string;
}

interface Palette {
  bgTop: string;
  bgBottom: string;
  panel: string;
  text: string;
  muted: string;
  accent: string;
  ring: string;
}

/** Cat-paw-pink palettes. Accent shades are AA on their panel for the brand
 *  line; `elegant` stays a dark neutral with a soft pink accent. */
const PALETTES: Record<CardTemplate, Palette> = {
  classic: {
    bgTop: "#fdf2f6",
    bgBottom: "#f6c2d6",
    panel: "#fffdfd",
    text: "#2a141c",
    muted: "#7a4a5a",
    accent: "#bf3568",
    ring: "#bf3568",
  },
  playful: {
    bgTop: "#ffe3ef",
    bgBottom: "#f9c2da",
    panel: "#ffffff",
    text: "#4a1228",
    muted: "#9d4a6c",
    accent: "#d6447a",
    ring: "#d6447a",
  },
  elegant: {
    bgTop: "#241b20",
    bgBottom: "#140e12",
    panel: "#201820",
    text: "#f7f1f4",
    muted: "#b8a6af",
    accent: "#ee9cbb",
    ring: "#ee9cbb",
  },
};

/** Per-template paw-print watermark behind the content. `classic` is dense,
 *  `playful` is sparser/larger, `elegant` has none (it relies on its thin
 *  frame). Drawn over the panel at low alpha so text stays fully legible. */
const PAW_PATTERN: Record<CardTemplate, { step: number; size: number; alpha: number } | null> = {
  classic: { step: 150, size: 30, alpha: 0.08 },
  playful: { step: 230, size: 40, alpha: 0.07 },
  elegant: null,
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** "#rrggbb" + alpha → "rgba(r,g,b,a)" for translucent strokes/fills. */
function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** One paw print (pad + four toe beans) centered at (cx, cy), rotated `rot`. The
 *  caller sets fillStyle/globalAlpha. */
function drawPaw(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, rot: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.ellipse(0, s * 0.35, s * 0.5, s * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  const toes: ReadonlyArray<readonly [number, number]> = [
    [-s * 0.5, -s * 0.12],
    [-s * 0.18, -s * 0.5],
    [s * 0.18, -s * 0.5],
    [s * 0.5, -s * 0.12],
  ];
  for (const [tx, ty] of toes) {
    ctx.beginPath();
    ctx.ellipse(tx, ty, s * 0.2, s * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Tiles paw prints across the whole card on a staggered grid, with a stable
 *  per-position rotation so the pattern never looks mechanical. */
function drawPawPattern(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
  step: number,
  size: number,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  let row = 0;
  for (let y = step * 0.5; y < h; y += step) {
    const offset = (row % 2) * step * 0.5;
    for (let x = step * 0.5 + offset; x < w; x += step) {
      const rot = (((x * 13 + y * 7) % 360) * Math.PI) / 180;
      drawPaw(ctx, x, y, size, rot);
    }
    row++;
  }
  ctx.restore();
}

/** Draws text wrapped to `maxWidth`, returns the y after the last line. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): number {
  const words = text.split(/\s+/);
  let line = "";
  let lines = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
      if (++lines >= maxLines - 1) break;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, y);
  return y + lineHeight;
}

/** Draws the photo (or an emoji placeholder) clipped to a centered circle. */
function drawAvatar(ctx: CanvasRenderingContext2D, photo: HTMLImageElement | null, cx: number, cy: number, radius: number, pal: Palette): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = pal.panel;
  ctx.fill();
  ctx.clip();
  if (photo) {
    // cover-fit the image inside the circle's bounding box
    const scale = Math.max((radius * 2) / photo.width, (radius * 2) / photo.height);
    const w = photo.width * scale;
    const h = photo.height * scale;
    ctx.drawImage(photo, cx - w / 2, cy - h / 2, w, h);
  } else {
    ctx.fillStyle = pal.muted;
    ctx.font = `${radius}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🐱", cx, cy + radius * 0.05);
  }
  ctx.restore();
  // ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.lineWidth = 10;
  ctx.strokeStyle = pal.ring;
  ctx.stroke();
}

/** Renders the whole card onto a 1080×1350 context. */
export function drawCatCard(ctx: CanvasRenderingContext2D, data: CardData, template: CardTemplate): void {
  const pal = PALETTES[template];
  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;
  ctx.clearRect(0, 0, W, H);

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, pal.bgTop);
  bg.addColorStop(1, pal.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Inner panel with a soft drop shadow for depth, then a thin inset accent
  // frame — a more refined "marco" than the previous flat rectangle.
  const margin = 60;
  ctx.save();
  ctx.shadowColor = "rgba(20, 8, 14, 0.18)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 12;
  roundRect(ctx, margin, margin, W - margin * 2, H - margin * 2, 48);
  ctx.fillStyle = pal.panel;
  ctx.fill();
  ctx.restore();

  // Paw-print watermark over the panel (classic/playful), behind the content.
  const paw = PAW_PATTERN[template];
  if (paw) drawPawPattern(ctx, W, H, pal.accent, paw.step, paw.size, paw.alpha);

  // Thin inset accent frame (all templates).
  roundRect(ctx, margin + 14, margin + 14, W - (margin + 14) * 2, H - (margin + 14) * 2, 38);
  ctx.lineWidth = 2;
  ctx.strokeStyle = withAlpha(pal.accent, 0.45);
  ctx.stroke();
  if (template === "elegant") {
    // Elegant keeps a second hairline for a couture, paw-free look.
    roundRect(ctx, margin + 22, margin + 22, W - (margin + 22) * 2, H - (margin + 22) * 2, 32);
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(pal.accent, 0.25);
    ctx.stroke();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  drawAvatar(ctx, data.photo, W / 2, 360, 200, pal);

  // Name
  ctx.fillStyle = pal.text;
  ctx.font = "bold 88px system-ui, sans-serif";
  ctx.fillText(data.name, W / 2, 690);

  // Fact lines (age, born, breed…)
  ctx.font = "40px system-ui, sans-serif";
  ctx.fillStyle = pal.muted;
  let y = 760;
  for (const fact of data.facts) {
    ctx.fillText(fact, W / 2, y);
    y += 56;
  }

  // Bio
  if (data.bio) {
    ctx.fillStyle = pal.text;
    ctx.font = "italic 38px Georgia, serif";
    ctx.textAlign = "center";
    y = wrapText(ctx, `“${data.bio}”`, W / 2, y + 30, W - 320, 52, 4);
  }

  // Horoscope band (optional)
  if (data.horoscope) {
    const bandY = H - 320;
    roundRect(ctx, 120, bandY, W - 240, 180, 28);
    ctx.fillStyle = template === "elegant" ? "rgba(238,156,187,0.12)" : "rgba(191,53,104,0.08)";
    ctx.fill();
    ctx.fillStyle = pal.accent;
    ctx.font = "bold 44px system-ui, sans-serif";
    ctx.fillText(`${data.horoscope.emoji}  ${data.horoscope.sign}`, W / 2, bandY + 62);
    ctx.fillStyle = pal.muted;
    ctx.font = "32px system-ui, sans-serif";
    wrapText(ctx, data.horoscope.phrase, W / 2, bandY + 110, W - 320, 40, 2);
  }

  // Brand footer
  ctx.fillStyle = pal.muted;
  ctx.font = "30px system-ui, sans-serif";
  ctx.fillText(`🐾 ${data.brand}`, W / 2, H - 110);
}
