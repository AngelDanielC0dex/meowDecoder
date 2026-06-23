import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import type { Provider } from "next-auth/providers";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/server/db/client";
import {
  users,
  accounts,
  authSessions,
  verificationTokens,
} from "@/server/db/schema";

/**
 * Auth.js (NextAuth v5) single source of truth.
 *
 * Strategy: passwordless email magic-link (Nodemailer) backed by the Postgres
 * DrizzleAdapter. Database session strategy (the adapter persists sessions in
 * `auth_sessions`), so a signed-in user is resolved server-side from the
 * session cookie — see `getServerUserId()` in ./session.ts.
 *
 * Activation requirements (documented in DEPLOYMENT.md / .env.example):
 *   - AUTH_SECRET         cookie/JWT signing secret (`npx auth secret`)
 *   - DATABASE_URL        Postgres (Supabase) with the adapter tables migrated
 *   - AUTH_EMAIL_SERVER   SMTP connection string for the magic-link mailer
 *   - AUTH_EMAIL_FROM     sender address shown on the magic-link email
 *
 * The adapter is created only when DATABASE_URL is present so `next build`
 * (and tooling) never opens a connection. Without the adapter the auth routes
 * still compile; sign-in simply no-ops until the env is configured.
 */
const databaseUrl = process.env.DATABASE_URL;
const emailServer = process.env.AUTH_EMAIL_SERVER;
const emailFrom = process.env.AUTH_EMAIL_FROM;

// The magic-link provider is added only when its SMTP env is present, so the
// app builds and runs without email configured (sign-in simply isn't offered).
// Cast: Auth.js v5-beta's NodemailerConfig isn't structurally assignable to
// Provider under `exactOptionalPropertyTypes`; the runtime shape is correct.
const providers: Provider[] =
  emailServer && emailFrom
    ? [Nodemailer({ server: emailServer, from: emailFrom }) as Provider]
    : [];

// Built only when DATABASE_URL is present; spread conditionally below so the
// `adapter` key is OMITTED (not set to undefined) under exactOptionalPropertyTypes.
const adapter = databaseUrl
  ? DrizzleAdapter(getDb(), {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: authSessions,
      verificationTokensTable: verificationTokens,
    })
  : null;

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Honor X-Forwarded-* behind Cloudflare / non-Vercel proxies.
  trustHost: true,
  ...(adapter ? { adapter } : {}),
  session: { strategy: "database" },
  providers,
  // Auth pages live outside the [locale] segment (excluded from the next-intl
  // middleware) so Auth.js redirects resolve without a locale prefix.
  pages: {
    signIn: "/auth/signin",
    verifyRequest: "/auth/verify",
    error: "/auth/error",
  },
  callbacks: {
    /**
     * Surface the user id on the session (database strategy passes the adapter
     * `user`). Every authorization check reads `session.user.id`.
     */
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});
