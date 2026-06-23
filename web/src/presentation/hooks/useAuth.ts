"use client";

import { useSession } from "next-auth/react";
import { ACCOUNTS_ENABLED } from "@/lib/accounts";

export interface AuthState {
  /** "loading" | "authenticated" | "unauthenticated". */
  status: "loading" | "authenticated" | "unauthenticated";
  isAuthenticated: boolean;
  userId: string | null;
  /** True only when the accounts feature is turned on for this deployment. */
  accountsEnabled: boolean;
}

/**
 * Thin, app-facing wrapper over Auth.js `useSession`. Centralizes the
 * registered-vs-anonymous decision so gating logic reads identically across
 * the feedback, history and cats surfaces.
 *
 * When accounts are disabled for the deployment, this always reports
 * unauthenticated (status "unauthenticated") and `accountsEnabled=false`, which
 * the call sites use to preserve the legacy local-first experience.
 */
export function useAuth(): AuthState {
  const { data, status } = useSession();
  return {
    status,
    isAuthenticated: status === "authenticated",
    userId: data?.user?.id ?? null,
    accountsEnabled: ACCOUNTS_ENABLED,
  };
}
