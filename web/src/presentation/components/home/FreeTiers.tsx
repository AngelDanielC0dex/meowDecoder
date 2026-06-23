import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * Landing tier comparison shown when the premium system is OFF (no Stripe yet).
 * It replaces the premium showcase with an honest, free-focused design:
 * "analyze anonymously" vs "create a free account" (history, corrections,
 * medical log). Pure server component — zero client JS, no price advertised.
 * When premium is enabled, the landing renders <PremiumPlans/> instead.
 */
export async function FreeTiers({ accountsEnabled }: { accountsEnabled: boolean }) {
  const t = await getTranslations("home");
  const anonFeatures = ["tierAnonF1", "tierAnonF2"] as const;
  const freeFeatures = ["tierFreeF1", "tierFreeF2", "tierFreeF3", "tierFreeF4"] as const;

  return (
    <section
      aria-labelledby="tiers-heading"
      className="mx-auto max-w-4xl px-4 py-[var(--spacing-section)]"
    >
      <h2 id="tiers-heading" className="text-center text-title font-bold text-balance">
        {t("tiersTitle")}
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-center text-ink-600 text-pretty">
        {t("tiersSubtitle")}
      </p>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {/* Anonymous tier */}
        <div className="rounded-2xl border border-brand-100 bg-surface p-6 shadow-sm">
          <h3 className="text-lg font-semibold">{t("tierAnonTitle")}</h3>
          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            {anonFeatures.map((k) => (
              <li key={k} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-0.5 text-brand-600">
                  ✓
                </span>
                <span>{t(k)}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Registered (free account) tier — highlighted as the recommended path */}
        <div className="rounded-2xl border-2 border-brand-300 bg-brand-50/40 p-6 shadow-sm">
          <h3 className="text-lg font-semibold">{t("tierFreeTitle")}</h3>
          <ul className="mt-4 space-y-2 text-sm text-ink-900">
            {freeFeatures.map((k) => (
              <li key={k} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-0.5 text-brand-600">
                  ✓
                </span>
                <span>{t(k)}</span>
              </li>
            ))}
          </ul>
          {/* CTA only when accounts are live for this deployment. */}
          {accountsEnabled && (
            <Link
              href="/auth/signin"
              className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-5 font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
            >
              {t("tiersCta")}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
