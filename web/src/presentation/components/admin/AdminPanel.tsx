"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { setFeatureFlagAction } from "@/server/actions/admin-flags";
import type { AdminToggleableFlag } from "@/server/flags";

type FlagRow = { key: AdminToggleableFlag; enabled: boolean };

/** Maps each toggleable flag to its (dot-free) i18n label/description keys. */
const COPY: Record<AdminToggleableFlag, { label: string; desc: string }> = {
  "premium.enabled": { label: "premiumEnabledLabel", desc: "premiumEnabledDesc" },
  "audioDonation.enabled": { label: "audioDonationLabel", desc: "audioDonationDesc" },
};

/**
 * Admin toggles for the product feature flags. Each change is optimistic and
 * reconciled against the server's resolved flag map; a failed save (e.g. the
 * session lost admin) reverts the switch and surfaces an error. The server
 * action re-checks `requireAdmin()`, so this UI is never the security boundary.
 */
export function AdminPanel({ initialFlags }: { initialFlags: FlagRow[] }) {
  const t = useTranslations("admin");
  const [flags, setFlags] = useState<FlagRow[]>(initialFlags);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(key: AdminToggleableFlag, enabled: boolean) {
    setError(null);
    setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled } : f)));
    startTransition(async () => {
      try {
        const resolved = await setFeatureFlagAction({ key, enabled });
        setFlags((prev) => prev.map((f) => ({ ...f, enabled: resolved[f.key] })));
      } catch {
        setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, enabled: !enabled } : f)));
        setError(t("saveError"));
      }
    });
  }

  return (
    <div className="mt-6 space-y-3">
      {flags.map((f) => (
        <label
          key={f.key}
          className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-ink-100 p-4 hover:bg-ink-50/40"
        >
          <span>
            <span className="font-medium text-ink-900">{t(COPY[f.key].label)}</span>
            <span className="mt-0.5 block text-sm text-ink-600">{t(COPY[f.key].desc)}</span>
          </span>
          <input
            type="checkbox"
            checked={f.enabled}
            disabled={pending}
            onChange={(e) => toggle(f.key, e.target.checked)}
            className="h-5 w-5 shrink-0 accent-brand-600 disabled:opacity-50"
          />
        </label>
      ))}
      {error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
