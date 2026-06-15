"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import type { AnalysisSession } from "@/domain/analysis/session";
import { getVocalizationByClass } from "@/content/vocalizations";
import { formatProbability } from "@/presentation/formatters";
import { container } from "@/presentation/state/composition";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/presentation/components/ui/Button";

export function HistoryList() {
  const t = useTranslations("history");
  const locale = useLocale() as AppLocale;
  const [sessions, setSessions] = useState<readonly AnalysisSession[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setSessions(await container.sessions.getRecent(50));
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (loading) return <p className="text-ink-600">…</p>;
  if (sessions.length === 0) return <p className="text-ink-600">{t("empty")}</p>;

  return (
    <ul className="flex flex-col gap-3">
      {sessions.map((s) => {
        const voc = getVocalizationByClass(s.classification.primary.cls);
        return (
          <li
            key={s.id}
            className="flex items-center justify-between gap-4 rounded-xl border border-brand-100 p-4"
          >
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="text-2xl">
                {voc?.emoji ?? "❓"}
              </span>
              <div>
                <p className="font-medium">{voc?.i18n[locale].name ?? s.classification.primary.cls}</p>
                <p className="text-sm text-ink-600">
                  {new Date(s.createdAt).toLocaleString(locale)} ·{" "}
                  {formatProbability(s.classification.primary.probability)}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              onClick={async () => {
                await container.sessions.delete(s.id);
                await refresh();
              }}
            >
              {t("deleteEntry")}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
