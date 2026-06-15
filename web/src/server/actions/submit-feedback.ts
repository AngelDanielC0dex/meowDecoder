"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { verifyTurnstileToken } from "../security/verify-turnstile";
import { rateLimit } from "../security/rate-limit";
import { getServerUserId } from "../auth/session";

/**
 * Server Action: submit user feedback with bot-proof verification.
 *
 * This is the ONLY server-side entry point for feedback writes.
 * The Turnstile token is verified against the Cloudflare API before
 * any data reaches the database.
 *
 * Flow:
 *  1. Client sends feedback data + Turnstile token.
 *  2. Server validates input shape with Zod.
 *  3. Server verifies Turnstile token with Cloudflare.
 *  4. Only then: write to database (activated in E3 when sync is live).
 */

const FeedbackPayloadSchema = z.object({
  sessionId: z.string().uuid(),
  verdict: z.enum(["correct", "partially-correct", "incorrect"]),
  predictedClass: z.string().min(1),
  correctedClass: z.string().nullable(),
  sharedForTraining: z.boolean(),
  turnstileToken: z.string().min(1, "Turnstile token is required"),
});

export type SubmitFeedbackResult =
  | { ok: true }
  | { ok: false; error: "invalid-input" | "bot-detected" | "rate-limited" | "server-error" };

export async function submitFeedbackAction(
  raw: unknown,
): Promise<SubmitFeedbackResult> {
  // Step 0: Per-IP rate limit. Bot-proofing (Turnstile) protects against
  // automation, but a hard rate cap also bounds dataset-poisoning attempts
  // (flooding corrections to bias future retraining) and DB write abuse.
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`feedback:${ip}`, 30, 60_000).ok) {
    return { ok: false, error: "rate-limited" };
  }

  // Step 1: Validate input shape
  const parsed = FeedbackPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "invalid-input" };
  }

  // Step 2: Verify the human behind the request
  const isHuman = await verifyTurnstileToken(parsed.data.turnstileToken);
  if (!isHuman) {
    return { ok: false, error: "bot-detected" };
  }

  // Step 3: Persist server-side ONLY for authenticated users (per product
  // decision: per-cat history lives on the server only when you have an
  // account). getServerUserId() returns null until Auth.js is wired (E3), so
  // this block is inert today and the local IndexedDB copy remains the source
  // of truth. Guarded so anonymous use never writes to the DB.
  const userId = await getServerUserId();
  if (userId) {
    try {
      const { getDb } = await import("../db/client");
      const { feedback } = await import("../db/schema");
      await getDb()
        .insert(feedback)
        .values({
          sessionId: parsed.data.sessionId,
          userId,
          verdict: parsed.data.verdict,
          predictedClass: parsed.data.predictedClass,
          correctedClass: parsed.data.correctedClass,
          sharedForTraining: parsed.data.sharedForTraining,
        });
    } catch (err) {
      console.error("[feedback] DB insert failed:", err);
      return { ok: false, error: "server-error" };
    }
  }

  return { ok: true };
}
