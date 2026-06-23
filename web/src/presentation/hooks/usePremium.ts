"use client";

import { useFlags } from "@/presentation/state/FlagsProvider";

/**
 * Single source of truth for "is this visitor a paying Premium user?".
 * Premium users see NO ads anywhere (that is the core value of the subscription).
 *
 * `premium.enabled` (admin panel → DB flag) is the master switch for the whole
 * premium system. While it is off — the default until Stripe is wired — this
 * always returns false (everyone is free-tier), so every ad/premium surface keeps
 * working unchanged. When billing ships, gate the per-user check here:
 *   const { user } = useAuth(); return premiumEnabled && user?.plan === "premium";
 * Keeping every surface behind this one hook means flipping it on is a one-line
 * change with zero call-site churn.
 */
export function usePremium(): boolean {
  const { premiumEnabled } = useFlags();
  if (!premiumEnabled) return false; // master switch off → pure free tier
  return false; // TODO(billing): return user?.plan === "premium" once Stripe lands
}
