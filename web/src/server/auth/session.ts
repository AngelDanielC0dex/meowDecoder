import { auth } from "./config";

/**
 * Resolves the authenticated user id for server-side writes, or `null` when
 * there is no session. This is the single server-side authorization gate:
 * every server action / route handler that persists user-owned data (feedback,
 * cats, history) MUST call this and reject anonymous (null) callers.
 *
 * Backed by Auth.js (see ./config.ts). Returns null safely when auth is not yet
 * configured (no DATABASE_URL / AUTH_SECRET), so anonymous use never writes to
 * the DB and the app keeps working without accounts.
 */
export async function getServerUserId(): Promise<string | null> {
  try {
    const session = await auth();
    return session?.user?.id ?? null;
  } catch {
    // auth() can throw if the env isn't configured yet — treat as anonymous.
    return null;
  }
}
