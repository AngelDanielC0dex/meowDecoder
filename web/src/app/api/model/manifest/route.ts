import { NextResponse } from "next/server";

/**
 * Returns the active model manifest the frontend negotiates against.
 * Decouples model publishing from app releases: ship a new model by flipping
 * `is_active` in model_versions; the client picks it up on next load.
 *
 * E1: no trained model yet → 204 so the client falls back to the heuristic
 * engine cleanly. E2 wires this to the model_versions table + object storage.
 */
export function GET() {
  return new NextResponse(null, { status: 204 });
}
