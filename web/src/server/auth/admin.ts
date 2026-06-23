import { auth } from "./config";

/**
 * Admin authorization. The set of admins is an allowlist of emails in the
 * server-only `ADMIN_EMAILS` env var (comma/space separated) — no `role` column
 * to migrate and no way to self-promote from the client. Every admin surface and
 * mutation MUST resolve this server-side; the UI is never trusted on its own.
 */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(/[,\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** True only for a signed-in user whose email is in the allowlist. */
export async function getIsAdmin(): Promise<boolean> {
  try {
    const allow = adminEmails();
    if (allow.length === 0) return false; // no admins configured → locked down
    const session = await auth();
    const email = session?.user?.email?.toLowerCase();
    return Boolean(email && allow.includes(email));
  } catch {
    // Auth not configured (no DB/secret) → never grant admin.
    return false;
  }
}

/** Guards admin-only actions/pages. Throws `admin/forbidden` when not an admin. */
export async function requireAdmin(): Promise<void> {
  if (!(await getIsAdmin())) throw new Error("admin/forbidden");
}
