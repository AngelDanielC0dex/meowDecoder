import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";

export async function SiteHeader() {
  const t = await getTranslations("nav");
  const links = [
    { href: "/", label: t("home") },
    { href: "/analyze", label: t("analyze") },
    { href: "/cats", label: t("cats") },
    { href: "/history", label: t("history") },
  ] as const;

  return (
    <header className="border-b border-brand-100">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3"
      >
        <Link href="/" className="flex items-center gap-2 font-bold text-brand-700">
          <span aria-hidden="true" className="text-2xl">
            🐾
          </span>
          MeowDecoder
        </Link>
        <ul className="hidden items-center gap-1 sm:flex">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="rounded-lg px-3 py-2 text-ink-600 hover:bg-brand-50 hover:text-ink-900"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
        </div>
      </nav>
    </header>
  );
}
