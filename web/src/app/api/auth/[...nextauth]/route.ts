import { handlers } from "@/server/auth/config";

/**
 * Auth.js HTTP endpoints (sign-in, callback, sign-out, session, CSRF, etc.).
 * All auth traffic flows through `/api/auth/*`, which the next-intl middleware
 * already excludes from locale rewriting.
 */
export const { GET, POST } = handlers;
