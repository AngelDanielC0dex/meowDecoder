/**
 * Single flag that turns the accounts/auth experience on. It is read on both
 * the server and the client (NEXT_PUBLIC_*, statically inlined by Next).
 *
 * While `false` (the default), the app behaves exactly as before: fully local,
 * no sign-in CTAs, corrections and history available on-device. Flip it to
 * "true" only once Auth.js is configured (AUTH_SECRET + DATABASE_URL + SMTP).
 * When `true`, anonymous visitors can analyze sounds but must sign in to
 * correct predictions or keep history (see the gating in the feedback/history/
 * cats surfaces).
 */
export const ACCOUNTS_ENABLED = process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED === "true";
