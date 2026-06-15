"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/presentation/components/ui/Button";

/**
 * Localized route-segment error boundary. Renders inside the locale layout, so
 * NextIntlClientProvider and translations are available. Gives the user a
 * recovery path instead of a dead screen when a render throws.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");

  useEffect(() => {
    // Surface to the console; a Telemetry sink can be attached here later.
    console.error("[route-error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-20 text-center">
      <h1 className="text-title font-bold">{t("errorTitle")}</h1>
      <p className="text-ink-600">{t("errorBody")}</p>
      <Button size="lg" onClick={reset}>
        {t("errorRetry")}
      </Button>
    </div>
  );
}
