import type { DefaultSession } from "next-auth";

/**
 * Augment the Auth.js session so `session.user.id` is typed everywhere. The id
 * is populated by the `session` callback in src/server/auth/config.ts.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
