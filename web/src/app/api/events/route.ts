import { NextResponse } from "next/server";
import { analyticsBatchSchema } from "@/server/validation";
import { clientIp, rateLimit } from "@/server/security/rate-limit";

/**
 * Analytics sink. Accepts batched, beacon'd events from the client telemetry
 * adapter. Best-effort: validation failures are dropped quietly (analytics
 * must never surface errors to users), genuine ones return 400.
 *
 * Hardened: per-IP rate limit + hard payload-size cap, so an unauthenticated
 * public endpoint can't be used to flood the (future) analytics_events table.
 *
 * E1: validates and acknowledges. E2+: persists to analytics_events.
 */
const MAX_BODY_BYTES = 32 * 1024; // 32 KB is generous for ≤50 small events
const RATE_LIMIT = 60; // requests…
const RATE_WINDOW_MS = 60_000; // …per minute per IP

export async function POST(request: Request) {
  const limit = rateLimit(`events:${clientIp(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const parsed = analyticsBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // TODO(E2): insert parsed.data.events into analytics_events.
  // Intentionally a no-op sink for now so the client contract is stable.
  return NextResponse.json({ ok: true, received: parsed.data.events.length });
}
