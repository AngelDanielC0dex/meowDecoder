"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Paw } from "./Paw";
import styles from "./PawBackground.module.css";

/**
 * A walking cat's paw-print trail moving FORWARD (toward the viewer).
 * Each walk is a sequence of 5 alternating L/R paw prints spaced along a
 * downward heading (45°–135° from horizontal) — never sideways or upward.
 * Staggered fade-in creates the forward-stepping illusion; the whole trail
 * fades out after ~6 s. Reduced-motion users see 3 static paws.
 *
 * Pure decoration — the layer is `aria-hidden` and `pointer-events:none`.
 */

/* ────────── Configuration ────────── */
const STEPS = 5;
/** Spacing between consecutive paw prints (% of viewport width). */
const STEP_SPACING = 5;
/** Sideways offset between left and right paw tracks (% of viewport width). */
const TRACK_OFFSET = 1.6;
/** Millisecond delay between successive step apparitions. */
const STEP_DELAY = 580;
/** Total animation duration for a single paw step (ms). Must match CSS keyframe. */
const ANIM_DURATION = 5200;
/** Extra tolerance (ms) after the last step finishes before the walk is unmounted. */
const CLEANUP_SLACK = 300;
/** Min / max gap between walk spawns (ms). */
const MIN_GAP = 7000;
const MAX_GAP = 14000;
/** Cap concurrent visible walks to avoid crowding. */
const MAX_CONCURRENT = 2;
/** Size of each paw, picked at random per walk (px). */
const PAW_SIZES = [36, 42, 50, 58];

/* ────────── Walk generation ────────── */
let nextId = 0;

interface StepSpec {
  key: string;
  left: number;
  top: number;
  flipped: boolean;
  delayMs: number;
  sizePx: number;
  rotateDeg: number;
}

interface Walk {
  id: string;
  steps: StepSpec[];
  /** Timestamp (performance.now) when the walk was created. */
  born: number;
  /** DOM removal deadline (born + last-step delay + anim + slack). */
  expiresAt: number;
}

function spawnWalk(): Walk {
  const id = `w${++nextId}`;
  // Forward motion: the cat walks TOWARD the viewer, so the trail heads
  // straight down on screen. Narrow cone (70°–110° from horizontal) so the
  // path is unambiguously downward — not sideways, not diagonal.
  const heading = 70 + Math.random() * 40;
  const rad = (heading * Math.PI) / 180;
  const dx = Math.cos(rad) * STEP_SPACING;
  const dy = Math.sin(rad) * STEP_SPACING;
  const px = Math.cos(rad + Math.PI / 2) * TRACK_OFFSET;
  const py = Math.sin(rad + Math.PI / 2) * TRACK_OFFSET;

  // Start point — keep a margin so the whole trail stays inside the viewport.
  // Estimate trail extent to clamp.
  const trailExtent = (STEPS - 1) * STEP_SPACING;
  const startLeft = 4 + Math.random() * Math.max(8, 90 - trailExtent - 4);
  // Forward walks start near the top so the trail has room to travel down.
  const startTop = 4 + Math.random() * Math.max(8, 60 - trailExtent - 4);

  // Randomise which paw ("L" or "R") lands first.
  const firstIsLeft = Math.random() < 0.5;
  const pawSize = PAW_SIZES[Math.floor(Math.random() * PAW_SIZES.length)] ?? 42;

  const steps: StepSpec[] = [];
  for (let i = 0; i < STEPS; i++) {
    const isLeft = (firstIsLeft && i % 2 === 0) || (!firstIsLeft && i % 2 === 1);
    const sign = isLeft ? -1 : 1;
    steps.push({
      key: `${id}-s${i}`,
      left: startLeft + dx * i + px * sign,
      top: startTop + dy * i + py * sign,
      flipped: isLeft,
      delayMs: i * STEP_DELAY,
      sizePx: pawSize,
      rotateDeg: heading + (isLeft ? -8 : 8), // slight natural toe-out
    });
  }

  const born = performance.now();
  const expiresAt = born + (STEPS - 1) * STEP_DELAY + ANIM_DURATION + CLEANUP_SLACK;

  return { id, steps, born, expiresAt };
}

/* ────────── Static fallback (reduced-motion) ────────── */
const STATIC_PAWS: readonly {
  left: number;
  top: number;
  sizePx: number;
  flipped: boolean;
  rotateDeg: number;
}[] = [
  { left: 18, top: 14, sizePx: 44, flipped: false, rotateDeg: 90 },
  { left: 68, top: 38, sizePx: 38, flipped: true, rotateDeg: 75 },
  { left: 80, top: 72, sizePx: 46, flipped: false, rotateDeg: 105 },
];

/* ────────── Component ────────── */
export function PawBackground() {
  const [walks, setWalks] = useState<Walk[]>([]);
  const [reduced, setReduced] = useState<boolean | null>(null);
  const spawnTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const groomTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  /* ── reduced-motion detection (one-shot) ── */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  /* ── Walk scheduling + lifecycle ── */
  const refresh = useCallback(() => {
    setWalks((prev) => {
      if (reduced) return prev.length ? [] : prev;
      const now = performance.now();
      const active = prev.filter((w) => w.expiresAt > now);
      if (active.length >= MAX_CONCURRENT) return active;
      return [...active, spawnWalk()];
    });
  }, [reduced]);

  useEffect(() => {
    if (reduced) {
      setWalks([]);
      return;
    }

    // Spawn the first walk immediately, then on a randomised cadence.
    refresh();

    const scheduleNext = () => {
      const gap = MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP);
      spawnTimer.current = setTimeout(() => {
        refresh();
        scheduleNext();
      }, gap);
    };
    scheduleNext();

    // Groomer: removals are driven by expiration, but React doesn't know when
    // the animation ends unless we poll periodically. Lightweight ticker.
    groomTimer.current = setInterval(() => {
      setWalks((prev) => {
        if (prev.length === 0) return prev;
        const now = performance.now();
        const fresh = prev.filter((w) => w.expiresAt > now);
        return fresh.length === prev.length ? prev : fresh;
      });
    }, 2000);

    return () => {
      clearTimeout(spawnTimer.current);
      clearInterval(groomTimer.current);
    };
  }, [reduced, refresh]);

  /* Still deciding */
  if (reduced === null) return null;

  return (
    <div className={styles.layer} aria-hidden="true">
      {/* Reduced-motion: static faint paws */}
      {reduced &&
        STATIC_PAWS.map((p, i) => (
          <span
            key={`static-${i}`}
            className={styles.staticStep}
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: `${p.sizePx}px`,
              height: `${p.sizePx}px`,
              ["--peak" as string]: "0.1",
              ["--rot" as string]: `${p.rotateDeg}deg`,
              ...(p.flipped ? { transform: "scaleX(-1) rotate(var(--rot))" } : {}),
            }}
          >
            <Paw />
          </span>
        ))}

      {/* Walking trails */}
      {!reduced &&
        walks.map((walk) => (
          <div key={walk.id} className={styles.walk}>
            {walk.steps.map((step) => (
              <span
                key={step.key}
                className={styles.step}
                style={{
                  left: `${step.left}%`,
                  top: `${step.top}%`,
                  width: `${step.sizePx}px`,
                  height: `${step.sizePx}px`,
                  animationDelay: `${step.delayMs}ms`,
                  animationDuration: `${ANIM_DURATION}ms`,
                  ["--peak" as string]: "0.14",
                  ["--rot" as string]: `${step.rotateDeg}deg`,
                  ...(step.flipped ? { transform: "scaleX(-1)" } : {}),
                }}
              >
                <Paw />
              </span>
            ))}
          </div>
        ))}
    </div>
  );
}
