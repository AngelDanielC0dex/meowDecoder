import type { Telemetry, TelemetryEvent } from "@/application/ports/telemetry";

/**
 * Structured telemetry adapter.
 * Dev: pretty console logs. Prod: batched, sendBeacon'd to /api/events
 * (fire-and-forget; analytics must never degrade UX or block unload).
 * Error sink (Sentry et al.) can be attached here without touching product code.
 */
class BrowserTelemetry implements Telemetry {
  private queue: Array<{ name: string; props: Record<string, unknown>; ts: number }> = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  track(event: TelemetryEvent): void {
    const { name, ...props } = event;
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[telemetry] ${name}`, props);
      return;
    }
    this.queue.push({ name, props, ts: Date.now() });
    this.scheduleFlush();
  }

  error(error: unknown, context?: Record<string, unknown>): void {
    console.error("[error]", error, context);
    this.track({
      name: "analysis_failed",
      stage: String(context?.stage ?? "unknown"),
      code: error instanceof Error ? error.message.slice(0, 120) : "unknown",
    } as TelemetryEvent);
  }

  private scheduleFlush(): void {
    this.flushTimer ??= setTimeout(() => this.flush(), 5000);
  }

  private flush(): void {
    this.flushTimer = null;
    if (this.queue.length === 0) return;
    const batch = JSON.stringify({ events: this.queue.splice(0, 50) });
    try {
      navigator.sendBeacon?.("/api/events", new Blob([batch], { type: "application/json" }));
    } catch {
      /* analytics is best-effort by design */
    }
  }
}

export const telemetry: Telemetry = new BrowserTelemetry();
