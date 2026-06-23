import type { CardTemplate } from "@/domain/cat/cat";

/**
 * Canvas renderer for the downloadable cat presentation card. ONE source of
 * truth for both the on-screen preview and the PNG export (the preview IS a
 * canvas), so they can never diverge, and there is no html-to-image dependency
 * or cross-origin/taint issue (the photo is a local blob drawn directly).
 *
 * Three DISTINCT designs share a common vertical layout (avatar → name → facts →
 * bio → horoscope → brand) but differ in mood:
 *   - classic  → "Minimal": light, airy, a thin rose accent.
 *   - playful  → "Sticker": paw-pattern bg, rounded panel, colorful fact pills.
 *   - elegant  → "Premium": dark, serif, a double rose/gold frame.
 *
 * It is i18n-agnostic: the caller passes already-localized strings.
 */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;
const W = CARD_WIDTH;
const H = CARD_HEIGHT;
const TAU = Math.PI * 2;

// Shared vertical layout (tuned to never overlap, with or without bio/horoscope).
const AVATAR = { cx: W / 2, cy: 360, r: 195 };
const NAME_Y = 685;
const FACTS_Y = 760;
const BIO_Y = 835;
const HORO_Y = H - 330;
const BRAND_Y = H - 80;

export interface CardData {
  readonly name: string;
  readonly photo: HTMLImageElement | null;
  /** Already-localized fact lines, e.g. ["3 años", "Nació el 12 mar 2022"]. */
  readonly facts: readonly string[];
  readonly bio: string | null;
  readonly horoscope: { emoji: string; sign: string; phrase: string } | null;
  readonly brand: string;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** "#rrggbb" + alpha → "rgba(r,g,b,a)" for translucent strokes/fills. */
function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** One paw print (pad + four toe beans) centered at (cx, cy), rotated `rot`. */
function drawPaw(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, rot: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.ellipse(0, s * 0.35, s * 0.5, s * 0.42, 0, 0, TAU);
  ctx.fill();
  const toes: ReadonlyArray<readonly [number, number]> = [
    [-s * 0.5, -s * 0.12],
    [-s * 0.18, -s * 0.5],
    [s * 0.18, -s * 0.5],
    [s * 0.5, -s * 0.12],
  ];
  for (const [tx, ty] of toes) {
    ctx.beginPath();
    ctx.ellipse(tx, ty, s * 0.2, s * 0.26, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Tiles paw prints across the whole card on a staggered grid (sticker bg). */
function drawPawPattern(ctx: CanvasRenderingContext2D, color: string, step: number, size: number, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  let row = 0;
  for (let y = step * 0.5; y < H; y += step) {
    const offset = (row % 2) * step * 0.5;
    for (let x = step * 0.5 + offset; x < W; x += step) {
      drawPaw(ctx, x, y, size, (((x * 13 + y * 7) % 360) * Math.PI) / 180);
    }
    row++;
  }
  ctx.restore();
}

/** Draws text wrapped to `maxWidth`, honoring explicit `\n` breaks; returns the
 *  y after the last line. Caps at `maxLines`. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): number {
  let lines = 0;
  for (const para of text.split("\n")) {
    if (lines >= maxLines) break;
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      y += lineHeight;
      lines++;
      continue;
    }
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        line = word;
        y += lineHeight;
        if (++lines >= maxLines) {
          line = "";
          break;
        }
      } else {
        line = test;
      }
    }
    if (line && lines < maxLines) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      lines++;
    }
  }
  return y;
}

/** Photo (or emoji placeholder) clipped to a circle, with one or two rings. */
function drawAvatar(
  ctx: CanvasRenderingContext2D,
  photo: HTMLImageElement | null,
  fill: string,
  ring: string,
  ringWidth: number,
  ring2?: string,
): void {
  const { cx, cy, r } = AVATAR;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.clip();
  if (photo) {
    const scale = Math.max((r * 2) / photo.width, (r * 2) / photo.height);
    const w = photo.width * scale;
    const h = photo.height * scale;
    ctx.drawImage(photo, cx - w / 2, cy - h / 2, w, h);
  } else {
    ctx.fillStyle = withAlpha(ring, 0.7);
    ctx.font = `${r}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🐱", cx, cy + r * 0.05);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.lineWidth = ringWidth;
  ctx.strokeStyle = ring;
  ctx.stroke();
  if (ring2) {
    ctx.beginPath();
    ctx.arc(cx, cy, r + ringWidth * 1.4, 0, TAU);
    ctx.lineWidth = 2;
    ctx.strokeStyle = ring2;
    ctx.stroke();
  }
}

/** Centered row of rounded "pill" badges (sticker facts). */
function drawFactPills(ctx: CanvasRenderingContext2D, facts: readonly string[], y: number, pillBg: string, pillText: string): void {
  ctx.font = "600 34px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const padX = 24;
  const gap = 16;
  const h = 58;
  const widths = facts.map((f) => ctx.measureText(f).width + padX * 2);
  let total = gap * Math.max(0, facts.length - 1);
  for (const w of widths) total += w;
  let x = W / 2 - total / 2;
  facts.forEach((f, i) => {
    const w = widths[i] ?? 0;
    roundRect(ctx, x, y - h, w, h, h / 2);
    ctx.fillStyle = pillBg;
    ctx.fill();
    ctx.fillStyle = pillText;
    ctx.fillText(f, x + w / 2, y - 18);
    x += w + gap;
  });
}

function drawMinimal(ctx: CanvasRenderingContext2D, data: CardData): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(1, "#fdf2f6");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  drawAvatar(ctx, data.photo, "#fdf2f6", "#bf3568", 8);

  ctx.fillStyle = "#2a141c";
  ctx.font = "700 100px system-ui, sans-serif";
  ctx.fillText(data.name, W / 2, NAME_Y);
  // thin accent divider
  ctx.strokeStyle = "#bf3568";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 60, NAME_Y + 28);
  ctx.lineTo(W / 2 + 60, NAME_Y + 28);
  ctx.stroke();

  if (data.facts.length) {
    ctx.fillStyle = "#7a4a5a";
    ctx.font = "40px system-ui, sans-serif";
    ctx.fillText(data.facts.join("    ·    "), W / 2, FACTS_Y + 40);
  }
  if (data.bio) {
    ctx.fillStyle = "#3a2630";
    ctx.font = "italic 42px Georgia, serif";
    wrapText(ctx, `“${data.bio}”`, W / 2, BIO_Y + 30, W - 280, 56, 3);
  }
  if (data.horoscope) {
    ctx.fillStyle = "#bf3568";
    ctx.font = "600 46px system-ui, sans-serif";
    ctx.fillText(`${data.horoscope.emoji}  ${data.horoscope.sign}`, W / 2, HORO_Y + 60);
    ctx.fillStyle = "#7a4a5a";
    ctx.font = "italic 34px Georgia, serif";
    wrapText(ctx, data.horoscope.phrase, W / 2, HORO_Y + 110, W - 320, 42, 2);
  }
  ctx.fillStyle = "#9a7a86";
  ctx.font = "500 30px system-ui, sans-serif";
  ctx.fillText(`🐾 ${data.brand}`, W / 2, BRAND_Y);
}

function drawSticker(ctx: CanvasRenderingContext2D, data: CardData): void {
  ctx.fillStyle = "#ffe3ef";
  ctx.fillRect(0, 0, W, H);
  drawPawPattern(ctx, "#d6447a", 150, 30, 0.1);
  // white rounded "sticker" panel with a thick rose border
  const m = 46;
  roundRect(ctx, m, m, W - m * 2, H - m * 2, 60);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = "#d6447a";
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  drawAvatar(ctx, data.photo, "#ffe3ef", "#d6447a", 12, "#ffd0a8");

  ctx.fillStyle = "#4a1228";
  ctx.font = "800 104px system-ui, sans-serif";
  ctx.fillText(data.name, W / 2, NAME_Y);

  if (data.facts.length) drawFactPills(ctx, data.facts, FACTS_Y + 50, "#ffe3ef", "#b8345f");

  if (data.bio) {
    // speech-bubble-ish rounded box
    roundRect(ctx, 150, BIO_Y, W - 300, 190, 28);
    ctx.fillStyle = "#fff5f9";
    ctx.fill();
    ctx.fillStyle = "#7a2a48";
    ctx.font = "italic 40px Georgia, serif";
    wrapText(ctx, `“${data.bio}”`, W / 2, BIO_Y + 64, W - 360, 52, 3);
  }
  if (data.horoscope) {
    ctx.font = "700 40px system-ui, sans-serif";
    const label = `${data.horoscope.emoji}  ${data.horoscope.sign}`;
    const pw = ctx.measureText(label).width + 64;
    roundRect(ctx, W / 2 - pw / 2, HORO_Y + 20, pw, 72, 36);
    ctx.fillStyle = "#d6447a";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, W / 2, HORO_Y + 68);
  }
  ctx.fillStyle = "#b8345f";
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.fillText(`🐾 ${data.brand}`, W / 2, BRAND_Y);
}

function drawPremium(ctx: CanvasRenderingContext2D, data: CardData): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#241b20");
  g.addColorStop(1, "#140e12");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // double inset frame: rose + soft gold
  roundRect(ctx, 40, 40, W - 80, H - 80, 40);
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha("#ee9cbb", 0.7);
  ctx.stroke();
  roundRect(ctx, 52, 52, W - 104, H - 104, 32);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = withAlpha("#d9b88a", 0.6);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  drawAvatar(ctx, data.photo, "#201820", "#ee9cbb", 6, "#d9b88a");

  ctx.fillStyle = "#f7f1f4";
  ctx.font = "700 96px Georgia, serif";
  ctx.fillText(data.name, W / 2, NAME_Y);

  if (data.facts.length) {
    ctx.fillStyle = "#b8a6af";
    ctx.font = "38px Georgia, serif";
    ctx.fillText(data.facts.join("    ·    "), W / 2, FACTS_Y + 40);
  }
  if (data.bio) {
    ctx.fillStyle = "#e9dde3";
    ctx.font = "italic 40px Georgia, serif";
    wrapText(ctx, `“${data.bio}”`, W / 2, BIO_Y + 30, W - 300, 54, 3);
  }
  if (data.horoscope) {
    roundRect(ctx, 130, HORO_Y, W - 260, 180, 24);
    ctx.fillStyle = withAlpha("#ee9cbb", 0.1);
    ctx.fill();
    ctx.strokeStyle = withAlpha("#d9b88a", 0.4);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#ee9cbb";
    ctx.font = "700 44px Georgia, serif";
    ctx.fillText(`${data.horoscope.emoji}  ${data.horoscope.sign}`, W / 2, HORO_Y + 66);
    ctx.fillStyle = "#b8a6af";
    ctx.font = "italic 32px Georgia, serif";
    wrapText(ctx, data.horoscope.phrase, W / 2, HORO_Y + 112, W - 340, 40, 2);
  }
  ctx.fillStyle = "#9a8a90";
  ctx.font = "500 30px Georgia, serif";
  ctx.fillText(`🐾 ${data.brand}`, W / 2, BRAND_Y);
}

/** Renders the whole card onto a 1080×1350 context. */
export function drawCatCard(ctx: CanvasRenderingContext2D, data: CardData, template: CardTemplate): void {
  ctx.clearRect(0, 0, W, H);
  if (template === "playful") drawSticker(ctx, data);
  else if (template === "elegant") drawPremium(ctx, data);
  else drawMinimal(ctx, data);
}
