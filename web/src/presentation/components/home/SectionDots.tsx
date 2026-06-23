"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/** The landing's snap sections, in document order. Each id must match a
 *  `<section id>` on the page; the label is an accessible name for its dot. */
const SECTIONS = ["hero", "how", "sounds", "plans", "science", "faq", "cta"] as const;

/**
 * Fixed vertical "dots" navigator for the landing's full-height sections. Click a
 * dot to scroll to its section; the active dot tracks the section currently in
 * view via an IntersectionObserver. Shown on large screens only (it would crowd
 * phones/tablets). Fully keyboard-operable and labelled; smooth scroll degrades
 * to an instant jump under prefers-reduced-motion.
 */
export function SectionDots() {
  const t = useTranslations("home.sections");
  const [active, setActive] = useState<string>("hero");

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

  function go(id: string) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  return (
    <nav
      aria-label={t("navLabel")}
      className="fixed right-4 top-1/2 z-20 hidden -translate-y-1/2 lg:block"
    >
      <ul className="flex flex-col items-center gap-3">
        {SECTIONS.map((id) => {
          const isActive = active === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => go(id)}
                aria-current={isActive ? "true" : undefined}
                aria-label={t(id)}
                className={`block rounded-full ring-1 ring-inset ring-brand-300/50 transition-all ${
                  isActive
                    ? "size-3.5 bg-brand-600"
                    : "size-2.5 bg-brand-200 hover:bg-brand-400"
                }`}
              />
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
