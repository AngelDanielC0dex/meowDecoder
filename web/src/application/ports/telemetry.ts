/**
 * Telemetry port. Product code emits semantic events; the adapter decides
 * where they go (console in dev, /api/events in prod, Sentry for errors).
 * Swapping providers never touches product code.
 */
export type TelemetryEvent =
  | { name: "analysis_started"; source: "microphone" | "file" }
  | { name: "analysis_completed"; engineId: string; certainty: string; durationMs: number }
  | { name: "analysis_failed"; stage: string; code: string }
  | { name: "feedback_given"; verdict: string }
  | { name: "model_load"; modelVersion: string; durationMs: number; fromCache: boolean }
  | { name: "mic_permission"; granted: boolean }
  | { name: "flow_abandoned"; stage: string };

export interface Telemetry {
  track(event: TelemetryEvent): void;
  error(error: unknown, context?: Record<string, unknown>): void;
}
