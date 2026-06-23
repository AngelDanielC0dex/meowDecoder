"use client";

import { createContext, useContext } from "react";

/**
 * Client-readable subset of the server feature flags. The locale layout resolves
 * these on the server (DB override → default) and hands them to this provider, so
 * client gates (premium, audio donation) react to an admin toggle on next load
 * with no env redeploy. Defaults are the safe "off-ish" values used when a
 * consumer renders outside the provider (it never throws).
 */
export type ClientFlags = {
  premiumEnabled: boolean;
  audioDonationEnabled: boolean;
};

const FALLBACK: ClientFlags = { premiumEnabled: false, audioDonationEnabled: true };

const FlagsContext = createContext<ClientFlags>(FALLBACK);

export function FlagsProvider({
  flags,
  children,
}: {
  flags: ClientFlags;
  children: React.ReactNode;
}) {
  return <FlagsContext.Provider value={flags}>{children}</FlagsContext.Provider>;
}

export function useFlags(): ClientFlags {
  return useContext(FlagsContext);
}
