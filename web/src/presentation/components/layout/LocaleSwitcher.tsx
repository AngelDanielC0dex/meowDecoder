"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { useTransition } from "react";

const LABELS: Record<string, string> = { es: "Español", en: "English" };

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <label className="text-sm">
      <span className="sr-only">Language</span>
      <select
        value={locale}
        disabled={isPending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(() => router.replace(pathname, { locale: next }));
        }}
        className="rounded-lg border border-brand-100 bg-surface px-2 py-1.5 min-h-9"
      >
        {routing.locales.map((l) => (
          <option key={l} value={l}>
            {LABELS[l] ?? l}
          </option>
        ))}
      </select>
    </label>
  );
}
