import { NextResponse } from "next/server";

/**
 * Sink for Content-Security-Policy violation reports during the Report-Only
 * rollout. Logs (truncated) so the policy can be tuned before enforcing.
 * Best-effort: never errors back to the browser.
 */
export async function POST(request: Request) {
  try {
    const report = await request.json();
    console.warn("[csp-report]", JSON.stringify(report).slice(0, 2000));
  } catch {
    /* malformed report — ignore */
  }
  return new NextResponse(null, { status: 204 });
}
