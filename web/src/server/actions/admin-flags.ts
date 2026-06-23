"use server";

import { z } from "zod";
import { requireAdmin } from "@/server/auth/admin";
import { getAllFlags, setFlag, type FlagKey } from "@/server/flags";

/**
 * Toggle an admin-controllable feature flag. Authorization is enforced
 * server-side via `requireAdmin()` BEFORE any write, and the key is constrained
 * to the toggleable allowlist so a forged request can never flip an infra flag.
 * Returns the freshly resolved flag map for the UI to reconcile against.
 */
const inputSchema = z.object({
  key: z.enum(["premium.enabled", "audioDonation.enabled"]),
  enabled: z.boolean(),
});

export async function setFeatureFlagAction(
  input: z.infer<typeof inputSchema>,
): Promise<Record<FlagKey, boolean>> {
  await requireAdmin();
  const { key, enabled } = inputSchema.parse(input);
  await setFlag(key, enabled);
  return getAllFlags();
}
