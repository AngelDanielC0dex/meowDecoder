/**
 * Time as an injectable capability so use cases stay pure and deterministic
 * in tests (no direct Date.now()/performance.now() reaching into globals).
 */
export interface Clock {
  /** Wall-clock epoch milliseconds — for persisted timestamps. */
  now(): number;
  /** Monotonic milliseconds — for measuring elapsed durations. */
  monotonicMs(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  monotonicMs: () =>
    typeof performance !== "undefined" ? performance.now() : Date.now(),
};
