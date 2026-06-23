import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { MobileMenu } from "./MobileMenu";
import { AccountMenu } from "./AccountMenu";
import { ThemeToggle } from "./ThemeToggle";
import { NavLink } from "./NavLink";
import { CatLogo } from "@/presentation/components/decor/CatLogo";

export async function SiteHeader() {
  const t = await getTranslations("nav");
  const links = [
    { href: "/" as const, label: t("home") },
    { href: "/analyze" as const, label: t("analyze") },
    { href: "/cats" as const, label: t("cats") },
    { href: "/cards" as const, label: t("cards") },
    { href: "/history" as const, label: t("history") },
    { href: "/medical" as const, label: t("medical") },
    // No standalone assistant link: the premium AI chatbot lives embedded in the
    // history and medical surfaces (shown only when premium is enabled).
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-brand-100 bg-surface/85 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
      <nav
        aria-label={t("primary")}
        className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3"
      >
        <Link
          href="/"
          className="interactive flex items-center gap-2 rounded-md px-1 py-1 font-bold text-brand-700 dark:text-brand-300"
        >
          <CatLogo className="h-7 w-auto" />
          <span>MeowDecoder</span>
        </Link>
        <ul className="hidden items-center gap-1 sm:flex">
          {links.map((l) => (
            <li key={l.href}>
              <NavLink
                href={l.href}
                label={l.label}
                className="block rounded-lg px-3 py-2 text-ink-600 transition-colors hover:bg-brand-50 hover:text-ink-900"
                activeClassName="bg-brand-50 font-semibold text-brand-700 dark:text-brand-300"
              />
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <AccountMenu />
          <LocaleSwitcher />
          <MobileMenu links={links} />
        </div>
      </nav>
    </header>
  );
}
