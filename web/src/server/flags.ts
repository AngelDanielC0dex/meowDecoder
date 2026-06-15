/**
 * Feature flags. Server-resolved so monetization and staged rollouts toggle
 * without a redeploy. Falls back to safe defaults when the DB is unavailable
 * (flags must never take the app down).
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

export async function isEnabled(key: FlagKey): Promise<boolean> {
  // E1: static defaults. E4 wires this to the feature_flags table with
  // percentage rollout. Kept as a single function so call sites never change.
  return DEFAULT_FLAGS[key];
}
