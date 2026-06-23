"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const LABELS: Record<string, string> = { es: "Español", en: "English" };

/**
 * Language selector as an icon-triggered popover (disclosure pattern). The
 * trigger shows a globe + the active language name; the list only opens when the
 * trigger is pressed, and closes on outside-click, Escape (returning focus to the
 * trigger) or selection. Switching preserves the current path and uses a
 * transition so the UI stays responsive during the locale navigation.
 */
export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function select(next: string) {
    setOpen(false);
    if (next === locale) return;
    startTransition(() => router.replace(pathname, { locale: next }));
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((s) => !s)}
        disabled={isPending}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={t("changeLanguage")}
        className="interactive flex min-h-9 items-center gap-1.5 rounded-lg border border-brand-100 bg-surface px-2.5 py-1.5 text-sm text-ink-700 hover:bg-brand-50 hover:text-ink-900"
      >
        <Image
          src="/gato-internacional.svg"
          alt=""
          width={16}
          height={16}
          unoptimized
          className="size-4"
          aria-hidden="true"
        />
        <span className="hidden sm:inline">{LABELS[locale] ?? locale}</span>
        <svg
          viewBox="0 0 24 24"
          className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <ul
          id={listId}
          aria-label={t("language")}
          className="absolute right-0 z-40 mt-1 min-w-[8.5rem] overflow-hidden rounded-lg border border-brand-100 bg-surface py-1 shadow-lg"
        >
          {routing.locales.map((l) => {
            const active = l === locale;
            return (
              <li key={l}>
                <button
                  type="button"
                  onClick={() => select(l)}
                  aria-current={active ? "true" : undefined}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-brand-50 ${
                    active ? "font-semibold text-brand-700 dark:text-brand-300" : "text-ink-700"
                  }`}
                >
                  <span aria-hidden="true" className="w-3.5 text-brand-600">
                    {active ? "✓" : ""}
                  </span>
                  {LABELS[l] ?? l}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
