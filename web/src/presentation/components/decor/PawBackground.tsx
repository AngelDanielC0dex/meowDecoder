import type { CSSProperties } from "react";
import { Paw } from "./Paw";
import styles from "./PawBackground.module.css";

/**
 * Site-wide animated paw-print background. A single fixed, decorative layer that
 * sits behind every page (mounted once in the layouts). Paws are scattered at
 * deterministic positions and fade/scale in and out on staggered cycles, giving
 * a subtle "cat walked by" ambience. Theme-aware (grey on light, dark-grey on
 * dark) via the --paw-color token; honors prefers-reduced-motion.
 *
 * Server component — pure markup + CSS, zero client JS.
 */

interface PawSpec {
  /** Position as viewport percentages. */
  readonly left: number;
  readonly top: number;
  /** Rendered size in px. */
  readonly size: number;
  readonly rotate: number;
  /** Animation timing (seconds) and peak opacity, for organic staggering. */
  readonly delay: number;
  readonly duration: number;
  readonly peak: number;
}

/** Hand-tuned scatter: spread across the viewport, varied size/rotation/timing
 *  so the pattern never looks gridded or pulses in unison. */
const PAWS: readonly PawSpec[] = [
  { left: 6, top: 12, size: 44, rotate: -12, delay: 0, duration: 9, peak: 0.18 },
  { left: 22, top: 70, size: 34, rotate: 16, delay: 3.5, duration: 11, peak: 0.15 },
  { left: 14, top: 40, size: 28, rotate: 30, delay: 6, duration: 8, peak: 0.13 },
  { left: 38, top: 18, size: 52, rotate: -8, delay: 1.5, duration: 12, peak: 0.16 },
  { left: 48, top: 84, size: 36, rotate: 22, delay: 5, duration: 10, peak: 0.15 },
  { left: 60, top: 30, size: 30, rotate: -20, delay: 8, duration: 9, peak: 0.13 },
  { left: 72, top: 64, size: 46, rotate: 10, delay: 2.5, duration: 11, peak: 0.18 },
  { left: 86, top: 16, size: 32, rotate: -14, delay: 7, duration: 8.5, peak: 0.15 },
  { left: 90, top: 48, size: 38, rotate: 18, delay: 4, duration: 12, peak: 0.16 },
  { left: 80, top: 88, size: 28, rotate: -24, delay: 9.5, duration: 9, peak: 0.12 },
  { left: 30, top: 52, size: 40, rotate: 6, delay: 10.5, duration: 10, peak: 0.14 },
  { left: 54, top: 56, size: 26, rotate: -16, delay: 6.5, duration: 8, peak: 0.12 },
  { left: 4, top: 82, size: 30, rotate: 24, delay: 11, duration: 11, peak: 0.14 },
  { left: 66, top: 6, size: 34, rotate: 12, delay: 3, duration: 9.5, peak: 0.15 },
];

export function PawBackground() {
  return (
    <div className={styles.layer} aria-hidden="true">
      {PAWS.map((p, i) => (
        <span
          key={i}
          className={styles.paw}
          style={
            {
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              "--rot": `${p.rotate}deg`,
              "--peak": p.peak,
            } as CSSProperties
          }
        >
          <Paw />
        </span>
      ))}
    </div>
  );
}
