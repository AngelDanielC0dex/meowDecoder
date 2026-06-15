/**
 * Pure formatting functions for the presentation layer.
 *
 * These transform raw domain values into display-ready strings.
 * Keeping formatting logic here (instead of inside JSX) ensures:
 *  - DRY: one formula, reused across ResultCard, HistoryList, etc.
 *  - Testability: pure functions with zero dependencies.
 *  - Separation of concerns: components render, formatters format.
 */

/** Convert a 0..1 probability to a percentage string: 0.847 → "85%" */
export function formatProbability(p: number): string {
  return `${Math.round(p * 100)}%`;
}

/** Format a frequency value: 500 → "500 Hz", null → "—" */
export function formatHz(hz: number | null): string {
  return hz != null ? `${Math.round(hz)} Hz` : "—";
}

/** Format a duration in seconds: 0.63 → "0.63 s" */
export function formatDuration(s: number): string {
  return `${s.toFixed(2)} s`;
}
