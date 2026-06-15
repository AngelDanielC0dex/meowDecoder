/**
 * Minimal in-memory rate limiter (fixed-window counter).
 *
 * Chosen over Redis for the MVP (explicit product decision): zero infra.
 * Trade-off: state is per-instance and resets on redeploy, so limits are NOT
 * shared across horizontally-scaled instances. Sufficient as basic abuse/DoS
 * protection; swap `buckets` for a Redis-backed store when scale demands shared
 * counters — the call sites never change.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  readonly ok: boolean;
  readonly remaining: number;
  readonly resetAt: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  existing.count += 1;

  // Opportunistic cleanup so the map can't grow unbounded under attack.
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (now >= v.resetAt) buckets.delete(k);
    }
  }

  return {
    ok: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
  };
}

/** Best-effort client IP from proxy headers; falls back to a constant bucket. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
