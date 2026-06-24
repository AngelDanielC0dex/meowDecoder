"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import type { AnalysisSession } from "@/domain/analysis/session";
import { getVocalizationByClass } from "@/content/vocalizations";
import { formatProbability } from "@/presentation/formatters";
import { container } from "@/presentation/state/composition";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/presentation/components/ui/Button";
import { useAuth } from "@/presentation/hooks/useAuth";
import { SignInGate } from "@/presentation/components/auth/SignInGate";
import { StatePhrase } from "@/presentation/components/results/StatePhrase";
import dynamic from "next/dynamic";

const FeedbackForm = dynamic(() => import("@/presentation/components/results/FeedbackForm"), {
  loading: () => <div className="h-48 animate-pulse rounded-xl bg-surface/50" />,
});

/** Plays a stored audio blob once, revoking the object URL when it ends. */
async function playStoredAudio(audioKey: string): Promise<void> {
  const blob = await container.sessions.getAudio(audioKey);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  await audio.play().catch(() => URL.revokeObjectURL(url));
}

/** Triggers a browser download of a stored audio blob. */
async function downloadStoredAudio(audioKey: string, filename: string): Promise<void> {
  const blob = await container.sessions.getAudio(audioKey);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Chronological history ("timeline") of analyses. Registered-only once accounts
 * are live. Each entry shows the interpretation phrase (seeded → stable) and, if
 * the audio was kept, lets the user replay or download it. Corrections can be
 * made right from here (reuses FeedbackForm, which shows the mandatory ad for
 * free users).
 */
export function HistoryList() {
  const t = useTranslations("history");
  const locale = useLocale() as AppLocale;
  const { accountsEnabled, isAuthenticated, status } = useAuth();
  const [sessions, setSessions] = useState<readonly AnalysisSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [correctingId, setCorrectingId] = useState<string | null>(null);

  const refresh = async () => {
    setSessions(await container.sessions.getRecent(50));
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (accountsEnabled && !isAuthenticated) {
    if (status === "loading") return null;
    return <SignInGate context="history" />;
  }

  if (loading) return <p className="text-ink-600">…</p>;
  if (sessions.length === 0) return <p className="text-ink-600">{t("empty")}</p>;

  return (
    <ul role="feed" aria-label={t("title")} className="flex flex-col gap-3">
      {sessions.map((s) => {
        const voc = getVocalizationByClass(s.classification.primary.cls);
        return (
          <li
            key={s.id}
            role="article"
            aria-labelledby={`hist-${s.id}`}
            className="rounded-xl border border-brand-100 p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="text-2xl">
                  {voc?.emoji ?? "❓"}
                </span>
                <div>
                  <p id={`hist-${s.id}`} className="font-medium">
                    {voc?.i18n[locale].name ?? s.classification.primary.cls}
                  </p>
                  <p className="text-sm text-ink-600">
                    <time dateTime={new Date(s.createdAt).toISOString()}>
                      {new Date(s.createdAt).toLocaleString(locale)}
                    </time>{" "}
                    · {formatProbability(s.classification.primary.probability)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1 sm:justify-end">
                {s.audioKey && (
                  <>
                    <Button variant="ghost" onClick={() => void playStoredAudio(s.audioKey!)}>
                      ▶ {t("playAudio")}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        void downloadStoredAudio(s.audioKey!, `meow-${s.id.slice(0, 8)}.webm`)
                      }
                    >
                      ⬇ {t("download")}
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  onClick={() => setCorrectingId((id) => (id === s.id ? null : s.id))}
                >
                  ✎ {t("correct")}
                </Button>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await container.sessions.delete(s.id);
                    await refresh();
                  }}
                >
                  {t("deleteEntry")}
                </Button>
              </div>
            </div>

            <div className="mt-2">
              <StatePhrase
                cls={s.classification.primary.cls}
                locale={locale}
                seed={s.phraseSeed}
              />
            </div>

            {correctingId === s.id && (
              <div className="mt-3">
                <FeedbackForm session={s} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
