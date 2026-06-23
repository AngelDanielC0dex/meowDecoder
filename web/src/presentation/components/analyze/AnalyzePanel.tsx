"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useAnalysisStore } from "@/presentation/state/analysis-store";
import { useAccess } from "@/presentation/hooks/useAccess";
import { useCats } from "@/presentation/hooks/useCats";
import type { CatId } from "@/domain/shared/ids";
import { Recorder } from "@/presentation/components/audio/Recorder";
import { Uploader } from "@/presentation/components/audio/Uploader";
import { PipelineProgress } from "@/presentation/components/audio/PipelineProgress";
import { ResultCard } from "@/presentation/components/results/ResultCard";
import { Button } from "@/presentation/components/ui/Button";
import { InterstitialAd } from "@/presentation/components/ads/InterstitialAd";
import { MAX_DURATION_S } from "@/infrastructure/audio/decode";

type Tab = "record" | "upload";

/** Map a pipeline/audio error code to a user-facing, translated message. */
function errorMessage(code: string | null, t: ReturnType<typeof useTranslations>): string {
  switch (code) {
    case "analysis/no-vocalization":
      return t("errorNoVocalization");
    case "audio/too-long":
      return t("errorTooLong", { seconds: MAX_DURATION_S });
    case "audio/too-short":
      return t("errorTooShort");
    case "audio/decode-failed":
    case "audio/resample-failed":
      return t("errorWrongFormat");
    default:
      return t("errorGeneric");
  }
}

/**
 * Orchestrates the capture → progress → result flow. Holds only view state
 * (active tab); all analysis state lives in the store and all logic in the
 * use case. The ONNX runtime and worker load only when this client component
 * mounts — never on the landing.
 */
export function AnalyzePanel() {
  const t = useTranslations("analyze");
  const [tab, setTab] = useState<Tab>("record");
  const { cats } = useCats();
  // Registered users persist to history (and can pick a cat / keep audio);
  // anonymous visitors analyze one-off, so those options are hidden and the
  // result is never saved.
  const { isRegistered } = useAccess();
  const { status, stage, session, errorCode, selectedCatId, keepAudio, setSelectedCat, setKeepAudio, analyze, reset } =
    useAnalysisStore();

  if (status === "done" && session) {
    return <ResultCard session={session} onAnalyzeAnother={reset} />;
  }

  if (status === "processing") {
    return (
      <div className="flex flex-col gap-6">
        <PipelineProgress stage={stage} />
        {/* Loading-moment ad (free users only; Premium sees nothing). */}
        <InterstitialAd label={t("analyzing")} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {isRegistered ? (
        // Registered: choose the cat (for personalized priors) and optionally
        // keep the audio — both only make sense when the session is persisted.
        <div className="flex flex-col gap-3 rounded-xl border border-brand-100 bg-surface p-4 shadow-sm">
          <label className="text-sm">
            <span className="mb-1 block font-medium">{t("selectCat")}</span>
            <select
              value={selectedCatId ?? ""}
              onChange={(e) => setSelectedCat(e.target.value ? (e.target.value as CatId) : null)}
              className="min-h-11 w-full rounded-lg border border-brand-200 bg-surface px-3 transition-colors focus:border-brand-500"
            >
              <option value="">{t("noCat")}</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm transition-colors hover:bg-brand-50/50">
            <input
              type="checkbox"
              checked={keepAudio}
              onChange={(e) => setKeepAudio(e.target.checked)}
              className="size-4 accent-brand-600"
            />
            <span>{t("keepAudio")}</span>
          </label>
        </div>
      ) : (
        // Anonymous: one-off analysis. Invite sign-in to unlock saved history.
        <p className="rounded-xl border border-brand-100 bg-brand-50/40 p-4 text-sm text-ink-600">
          🔒 {t("anonymousHint")}{" "}
          <Link href="/auth/signin" className="font-medium text-brand-700 hover:underline">
            {t("anonymousHintCta")}
          </Link>
        </p>
      )}

      <div
        role="tablist"
        aria-label={t("title")}
        className="flex gap-2"
        onKeyDown={(e) => {
          const order: Tab[] = ["record", "upload"];
          const idx = order.indexOf(tab);
          let nextIdx: number | null = null;
          if (e.key === "ArrowRight") nextIdx = (idx + 1) % order.length;
          else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + order.length) % order.length;
          else if (e.key === "Home") nextIdx = 0;
          else if (e.key === "End") nextIdx = order.length - 1;
          if (nextIdx !== null) {
            e.preventDefault();
            const next = order[nextIdx]!;
            setTab(next);
            document.getElementById(`tab-${next}`)?.focus();
          }
        }}
      >
        <TabButton active={tab === "record"} onClick={() => setTab("record")} id="tab-record">
          {t("recordTab")}
        </TabButton>
        <TabButton active={tab === "upload"} onClick={() => setTab("upload")} id="tab-upload">
          {t("uploadTab")}
        </TabButton>
      </div>

      <div
        id="analyze-tabpanel"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={tab === "record" ? "tab-record" : "tab-upload"}
        className="rounded-2xl border border-brand-100 bg-surface p-6 shadow-sm"
      >
        {tab === "record" ? (
          <Recorder onCaptured={(blob) => analyze(blob, "microphone", isRegistered)} />
        ) : (
          <Uploader onSelected={(blob) => analyze(blob, "file", isRegistered)} />
        )}
      </div>

      {status === "error" && (
        <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-100">
          <p>{errorMessage(errorCode, t)}</p>
          <Button variant="ghost" className="mt-2" onClick={reset}>
            {t("retry")}
          </Button>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  id,
  children,
}: {
  active: boolean;
  onClick: () => void;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <button
      id={id}
      role="tab"
      type="button"
      aria-selected={active}
      aria-controls="analyze-tabpanel"
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={`min-h-11 flex-1 rounded-xl px-4 font-medium transition-all focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${
        active
          ? "bg-brand-600 text-white shadow-sm"
          : "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-100 hover:ring-brand-300"
      }`}
    >
      {children}
    </button>
  );
}
