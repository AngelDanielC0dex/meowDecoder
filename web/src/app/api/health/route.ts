import { NextResponse } from "next/server";

/** Liveness probe for uptime monitoring / CI smoke tests. */
export function GET() {
  return NextResponse.json({ status: "ok", time: new Date().toISOString() });
}
