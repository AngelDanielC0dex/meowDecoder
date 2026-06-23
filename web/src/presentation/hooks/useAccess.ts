"use client";

import { useAuth } from "./useAuth";
import { usePremium } from "./usePremium";

/**
 * The single source of truth for the access tiers. Every surface (analyze,
 * history, corrections, medical, AI assistant) reads its gate from here so the
 * three-tier model is defined in exactly one place:
 *
 *   - anonymous : analyze one-off sounds (nothing persisted)
 *   - registered: + meow history, corrections, medical log
 *   - premium   : + AI assistant (requires `premium.enabled` AND a paid plan)
 *
 * Local-first fallback: when accounts are disabled for the deployment there is
 * no "register" step, so the on-device user keeps the full local experience
 * (history/corrections/medical). Registration only gates things once accounts
 * are turned on.
 */
export interface Access {
  /** "loading" only while an enabled accounts session is resolving. */
  status: "loading" | "ready";
  /** Can persist history, submit corrections and use the medical log. */
  isRegistered: boolean;
  /** Can use the AI assistant (implies `premium.enabled` via usePremium). */
  isPremium: boolean;
}

export function useAccess(): Access {
  const { status, isAuthenticated, accountsEnabled } = useAuth();
  const isPremium = usePremium();
  const isRegistered = accountsEnabled ? isAuthenticated : true;
  return {
    status: accountsEnabled && status === "loading" ? "loading" : "ready",
    isRegistered,
    isPremium,
  };
}
