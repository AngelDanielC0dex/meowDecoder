"use client";

/** Decorative live audio level bar. aria-hidden — it conveys no essential info
 * that isn't also given by the textual "Recording…" status. */
export function LevelMeter({ level }: { level: number }) {
  const pct = Math.min(100, Math.round(level * 140));
  return (
    <div
      aria-hidden="true"
      className="h-3 w-full overflow-hidden rounded-full bg-brand-100"
    >
      <div
        className="h-full rounded-full bg-brand-500 transition-[width] duration-75"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
