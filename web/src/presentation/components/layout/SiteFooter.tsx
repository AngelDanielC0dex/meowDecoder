import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CatLogo } from "@/presentation/components/decor/CatLogo";

export async function SiteFooter() {
  const t = await getTranslations();
  return (
    <footer className="mt-[var(--spacing-section)] border-t border-brand-100 bg-brand-50/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2">
        <div>
          <p className="flex items-center gap-2 font-bold text-brand-700 dark:text-brand-300">
            <CatLogo className="h-6 w-auto" />
            MeowDecoder
          </p>
          <p className="mt-2 text-sm text-brand-700 dark:text-brand-300">{t("meta.tagline")}</p>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-surface px-2.5 py-1 text-xs text-ink-600">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
            {t("footer.modelBadge")}
          </p>
        </div>
        <p className="self-end text-xs text-brand-700 dark:text-brand-300 sm:text-right">{t("result.notScience")}</p>
      </div>
      <div className="border-t border-brand-100">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-ink-600 sm:flex-row">
          <p>© {new Date().getFullYear()} MeowDecoder</p>
          <nav aria-label={t("footer.legal")} className="flex gap-4">
            <Link href="/legal/terms" className="transition-colors hover:text-brand-700 dark:hover:text-brand-300">
              {t("footer.terms")}
            </Link>
            <Link href="/legal/privacy" className="transition-colors hover:text-brand-700 dark:hover:text-brand-300">
              {t("footer.privacy")}
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
