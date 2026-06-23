"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CatLogo } from "@/presentation/components/decor/CatLogo";

interface NavLink {
  href: "/analyze" | "/cats" | "/cards" | "/history" | "/medical" | "/";
  label: string;
}

interface MobileMenuProps {
  links: readonly NavLink[];
}

/**
 * Accessible mobile navigation menu. Hidden on `sm` and up; toggled via a
 * button with `aria-expanded` and `aria-controls`. Closes on:
 *   - link click
 *   - Escape key
 *   - viewport resize past the breakpoint
 *
 * Body scroll is locked while the menu is open. `prefers-reduced-motion` is
 * honored because the only animation is a tiny opacity/scale transition.
 */
export function MobileMenu({ links }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("nav");
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onResize = () => {
      if (window.matchMedia("(min-width: 640px)").matches) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={open ? t("closeMenu") : t("openMenu")}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((s) => !s)}
        className="inline-flex size-11 items-center justify-center rounded-lg text-ink-700 hover:bg-brand-50 sm:hidden"
      >
        <span aria-hidden="true" className="text-xl leading-none">
          {open ? "✕" : "☰"}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 sm:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-modal="true"
        aria-label={t("primary")}
        hidden={!open}
        className="fixed inset-x-0 top-0 z-50 origin-top border-b border-brand-100 bg-surface shadow-lg transition-transform sm:hidden"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link
            href="/"
            className="flex items-center gap-2 font-bold text-brand-700"
            onClick={() => setOpen(false)}
          >
            <CatLogo className="h-7 w-auto" />
            MeowDecoder
          </Link>
          <button
            type="button"
            aria-label={t("closeMenu")}
            onClick={() => {
              setOpen(false);
              buttonRef.current?.focus();
            }}
            className="inline-flex size-11 items-center justify-center rounded-lg text-ink-700 hover:bg-brand-50"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ✕
            </span>
          </button>
        </div>
        <nav aria-label={t("primary")} className="mx-auto max-w-6xl px-4 pb-6">
          <ul className="flex flex-col">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-3 text-base text-ink-700 hover:bg-brand-50 hover:text-ink-900"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  );
}
