"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * Reusable "registered-only" placeholder. Shown in place of a feature that
 * requires an account (history, cats, corrections, medical, assistant) when
 * accounts are enabled and the visitor is anonymous. The `context` selects the
 * explanatory copy.
 */
export function SignInGate({
  context,
}: {
  context: "history" | "cats" | "correct" | "medical" | "assistant";
}) {
  const t = useTranslations("auth");
  const bodyKey = `body${context.charAt(0).toUpperCase()}${context.slice(1)}` as
    | "bodyHistory"
    | "bodyCats"
    | "bodyCorrect"
    | "bodyMedical"
    | "bodyAssistant";

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-6 text-center">
      <p className="text-2xl" aria-hidden="true">
        🔒
      </p>
      <p className="mt-2 font-semibold">{t("signInTitle")}</p>
      <p className="mt-1 text-sm text-ink-600">{t(bodyKey)}</p>
      <Link
        href="/auth/signin"
        className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
      >
        {t("signInCta")}
      </Link>
    </div>
  );
}
