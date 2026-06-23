import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * Premium subscription showcase for the landing. Pure server component (zero
 * client JS) so it never hurts LCP. Visually prominent ("irresistible") but
 * honest: benefits are real and the price is a single constant to update when
 * billing (Stripe) ships. The CTA routes to sign-in (account first); the actual
 * checkout is wired in the monetization phase.
 *
 * No Product/Offer JSON-LD yet ON PURPOSE — we won't emit a price to crawlers
 * until billing is live and the price is final.
 */

/** Update when billing is finalized. */
const PREMIUM_PRICE_LABEL = { es: "Próximamente", en: "Coming soon" } as const;

export async function PremiumPlans({ locale }: { locale: "es" | "en" }) {
  const t = await getTranslations("premium");
  const benefits = ["benefitAds", "benefitAssistant", "benefitMedical", "benefitTimeline"] as const;

  return (
    <section
      aria-labelledby="premium-heading"
      className="mx-auto max-w-3xl px-4 py-[var(--spacing-section)]"
    >
      <div className="overflow-hidden rounded-3xl border border-brand-200 bg-gradient-to-br from-brand-50 to-brand-100/60 p-8 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
          {t("badge")}
        </p>
        <h2 id="premium-heading" className="mt-2 text-title font-extrabold text-balance">
          {t("title")}
        </h2>
        <p className="mt-2 text-subtitle text-ink-600 text-pretty">{t("subtitle")}</p>

        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {benefits.map((b) => (
            <li key={b} className="flex items-start gap-2 text-ink-900">
              <span aria-hidden="true" className="mt-0.5 text-brand-600">✓</span>
              <span>{t(b)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-col items-center gap-2">
          <Link href="/auth/signin">
            <span className="inline-flex min-h-12 items-center rounded-xl bg-brand-600 px-6 font-semibold text-white shadow-sm transition-colors hover:bg-brand-700">
              ✨ {t("cta")}
            </span>
          </Link>
          <p className="text-xs text-ink-600">{PREMIUM_PRICE_LABEL[locale]}</p>
        </div>
      </div>
    </section>
  );
}
