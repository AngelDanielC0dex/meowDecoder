import { NextResponse } from "next/server";
import { getServerUserId } from "@/server/auth/session";
import { rateLimit } from "@/server/security/rate-limit";
import { askAssistant, assistantSchema } from "@/server/ai/assistant";

/**
 * Premium AI assistant endpoint (unified medical/meow modes).
 * Security layers, in order:
 *   1. Auth: must be a signed-in user (anonymous = 401). Premium plan check is
 *      added here once billing ships (today every account can use it).
 *   2. Rate limit per user: 8/hour AND 20/day (cost control).
 *   3. Zod validation + hard size caps on the injected context (prompt-injection
 *      and cost guard).
 * The OpenAI key is read server-side only inside askAssistant().
 */

export async function POST(request: Request) {
  const userId = await getServerUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Cost control: per-user hourly + daily caps.
  const hour = rateLimit(`assistant:h:${userId}`, 8, 60 * 60_000);
  const day = rateLimit(`assistant:d:${userId}`, 20, 24 * 60 * 60_000);
  if (!hour.ok || !day.ok) {
    return NextResponse.json({ error: "rate-limited" }, { status: 429, headers: { "Retry-After": "3600" } });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }
  const parsed = assistantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-input" }, { status: 422 });
  }

  const result = await askAssistant(parsed.data);
  if (!result.ok) {
    const status = result.code === "not-configured" ? 503 : 502;
    return NextResponse.json({ error: result.code }, { status });
  }
  return NextResponse.json({ answer: result.answer });
}
