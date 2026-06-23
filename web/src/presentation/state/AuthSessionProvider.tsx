"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Client boundary that exposes the Auth.js session to React via context, so
 * `useAuth()` works anywhere in the tree. Mounted once in the locale layout.
 *
 * `refetchOnWindowFocus={false}`: the session rarely changes mid-visit and the
 * default refetch adds needless requests; explicit sign-in/out already updates it.
 */
export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider refetchOnWindowFocus={false}>{children}</SessionProvider>;
}
