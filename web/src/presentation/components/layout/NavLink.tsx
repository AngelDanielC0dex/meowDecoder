"use client";

import { Link, usePathname } from "@/i18n/navigation";

/** The app's top-level navigable routes (locale-agnostic paths). */
export type AppNavHref = "/" | "/analyze" | "/cats" | "/cards" | "/history" | "/medical";

/**
 * Locale-aware nav link that marks the current page with `aria-current="page"`
 * (announced by screen readers) and a distinct visual state. `usePathname` from
 * next-intl already returns the path WITHOUT the locale prefix, so the compare
 * is direct.
 */
export function NavLink({
  href,
  label,
  className = "",
  activeClassName = "",
}: {
  href: AppNavHref;
  label: string;
  className?: string;
  activeClassName?: string;
}) {
  const pathname = usePathname();
  const isActive = pathname === href;
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`${className} ${isActive ? activeClassName : ""}`.trim()}
    >
      {label}
    </Link>
  );
}
