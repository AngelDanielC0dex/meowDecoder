"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/** The landing's snap sections, in document order. Each id must match a
 *  `<section id>` on the page; the label is an accessible name for its dot. */
const SECTIONS = ["hero", "how", "sounds", "plans", "science", "faq", "cta"] as const;

/**
 * Fixed vertical "dots" navigator for the landing's full-height sections. Click a
 * dot — or focus one and press the arrow keys — to move between sections; the
 * active dot tracks the section in view via an IntersectionObserver, and hovering
 * or focusing a dot reveals its section name. Large screens only (it would crowd
 * phones/tablets). Smooth scroll degrades to an instant jump under
 * prefers-reduced-motion.
 */
export function SectionDots() {
  const t = useTranslations("home.sections");
  const [active, setActive] = useState<string>("hero");
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const els = SECTIONS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { threshold: [0.25, 0.5, 0.75], rootMargin: "-15% 0px -15% 0px" },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  /** Move to the section at `index` (clamped) and keep keyboard focus on its dot. */
  const goTo = (index: number) => {
    const i = Math.max(0, Math.min(SECTIONS.length - 1, index));
    const id = SECTIONS[i];
    if (!id) return;
    scrollTo(id);
    btnRefs.current[i]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      goTo(index + 1);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(index - 1);
    }
  };

  return (
    <nav
      aria-label={t("navLabel")}
      className="fixed right-4 top-1/2 z-20 hidden -translate-y-1/2 lg:block"
    >
      <ul className="flex flex-col items-end gap-3">
        {SECTIONS.map((id, i) => {
          const isActive = active === id;
          return (
            <li key={id} className="group relative flex items-center">
              {/* Tooltip label — decorative (the dot's aria-label is the source of
                  truth); appears on hover or keyboard focus, themed to match. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-md bg-surface px-2 py-1 text-xs font-medium text-ink-900 opacity-0 shadow-md ring-1 ring-brand-200 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
              >
                {t(id)}
              </span>
              <button
                ref={(el) => {
                  btnRefs.current[i] = el;
                }}
                type="button"
                onClick={() => scrollTo(id)}
                onKeyDown={(e) => onKeyDown(e, i)}
                aria-current={isActive ? "true" : undefined}
                aria-label={t(id)}
                className={`relative block rounded-full ring-1 ring-inset ring-brand-300/50 transition-all after:absolute after:-inset-3 ${
                  isActive ? "size-3.5 bg-brand-600" : "size-2.5 bg-brand-200 hover:bg-brand-400"
                }`}
              />
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
