import { getDb } from "./db/client";
import { featureFlags } from "./db/schema";

/**
 * Feature flags. Server-resolved so monetization and staged rollouts toggle
 * without a redeploy. Overrides live in the `feature_flags` table (set from the
 * admin panel); when a key has no row, or the DB is unavailable, the safe
 * default below wins (flags must never take the app down).
 */
export const DEFAULT_FLAGS = {
  "premium.enabled": false,
  "premium.multiCat": false,
  "premium.unlimitedHistory": false,
  "premium.export": false,
  "audioDonation.enabled": true,
  "engine.onnx": false,
  // Accounts + server sync (Auth.js). Off until the auth layer ships, so the
  // landing never exposes a sign-in CTA that would 404.
  "accounts.enabled": false,
} as const;

export type FlagKey = keyof typeof DEFAULT_FLAGS;

/**
 * Flags the admin panel may flip (persisted in the DB). The rest are
 * infra/env-level (e.g. `accounts.enabled`, `engine.onnx`) and shown read-only.
 */
export const ADMIN_TOGGLEABLE_FLAGS = [
  "premium.enabled",
  "audioDonation.enabled",
] as const satisfies readonly FlagKey[];

export type AdminToggleableFlag = (typeof ADMIN_TOGGLEABLE_FLAGS)[number];

/** DB overrides keyed by flag; empty when the DB is unreachable. */
async function readFlagOverrides(): Promise<Partial<Record<FlagKey, boolean>>> {
  try {
    const rows = await getDb().select().from(featureFlags);
    const overrides: Partial<Record<FlagKey, boolean>> = {};
    for (const row of rows) {
      if (row.key in DEFAULT_FLAGS) overrides[row.key as FlagKey] = row.enabled;
    }
    return overrides;
  } catch {
    return {}; // no DB configured → fall back to defaults
  }
}

/** Fully resolved flag map (DB override → default), with env master switches applied. */
export async function getAllFlags(): Promise<Record<FlagKey, boolean>> {
  const overrides = await readFlagOverrides();
  const resolved = {} as Record<FlagKey, boolean>;
  for (const key of Object.keys(DEFAULT_FLAGS) as FlagKey[]) {
    resolved[key] = overrides[key] ?? DEFAULT_FLAGS[key];
  }
  // `accounts.enabled` is a deployment/infra master switch: it lights up the
  // sign-in surfaces exactly when the Auth.js stack is configured. Env wins.
  if (process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED === "true") {
    resolved["accounts.enabled"] = true;
  }
  return resolved;
}

export async function isEnabled(key: FlagKey): Promise<boolean> {
  return (await getAllFlags())[key];
}

/**
 * Persist a flag override. Admin-only: callers MUST have passed `requireAdmin()`
 * first (this function does not re-check, to keep it usable from trusted paths).
 */
export async function setFlag(key: FlagKey, enabled: boolean): Promise<void> {
  await getDb()
    .insert(featureFlags)
    .values({ key, enabled })
    .onConflictDoUpdate({ target: featureFlags.key, set: { enabled } });
}
