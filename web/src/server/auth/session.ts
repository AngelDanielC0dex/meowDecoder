/**
 * Resolves the authenticated user id for server-side writes, or null when there
 * is no session. Stubbed until Auth.js v5 is wired (E3 — accounts + sync).
 *
 * Wiring steps to enable server persistence of per-cat history/feedback:
 *  1. Add Auth.js adapter tables (accounts, auth_sessions, verification_tokens)
 *     to db/schema.ts and generate a migration: `npm run db:generate`.
 *     (Name them so they don't collide with the existing `sessions` table,
 *     which holds ANALYSIS sessions, not auth sessions.)
 *  2. Create auth.ts with DrizzleAdapter + an email magic-link provider.
 *  3. Replace the body below with:
 *        const session = await auth();
 *        return session?.user?.id ?? null;
 *  4. Ensure analysis sessions are synced server-side BEFORE inserting feedback
 *     (feedback.sessionId is a FK → sessions.id).
 *  5. Flip the "accounts.enabled" feature flag.
 */
export async function getServerUserId(): Promise<string | null> {
  return null;
}
