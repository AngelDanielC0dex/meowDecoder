"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAnalysisStore } from "@/presentation/state/analysis-store";
import { useCats } from "@/presentation/hooks/useCats";
import type { CatId } from "@/domain/shared/ids";
import { Recorder } from "@/presentation/components/audio/Recorder";
import { Uploader } from "@/presentation/components/audio/Uploader";
import { PipelineProgress } from "@/presentation/components/audio/PipelineProgress";
import { ResultCard } from "@/presentation/components/results/ResultCard";
import { Button } from "@/presentation/components/ui/Button";

type Tab = "record" | "upload";

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
  const { status, stage, session, errorCode, selectedCatId, keepAudio, setSelectedCat, setKeepAudio, analyze, reset } =
    useAnalysisStore();

  if (status === "done" && session) {
    return <ResultCard session={session} onAnalyzeAnother={reset} />;
  }

  if (status === "processing") {
    return <PipelineProgress stage={stage} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-xl border border-brand-100 p-4">
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("selectCat")}</span>
          <select
            value={selectedCatId ?? ""}
            onChange={(e) => setSelectedCat(e.target.value ? (e.target.value as CatId) : null)}
            className="min-h-11 w-full rounded-lg border border-brand-100 px-3"
          >
            <option value="">{t("noCat")}</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={keepAudio}
            onChange={(e) => setKeepAudio(e.target.checked)}
            className="size-4"
          />
          {t("keepAudio")}
        </label>
      </div>

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
        className="rounded-2xl border border-brand-100 p-6"
      >
        {tab === "record" ? (
          <Recorder onCaptured={(blob) => analyze(blob, "microphone")} />
        ) : (
          <Uploader onSelected={(blob) => analyze(blob, "file")} />
        )}
      </div>

      {status === "error" && (
        <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
          <p>{errorCode === "analysis/no-vocalization" ? t("errorNoVocalization") : t("errorGeneric")}</p>
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
      className={`min-h-11 flex-1 rounded-xl px-4 font-medium transition-colors ${
        active ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700 hover:bg-brand-100"
      }`}
    >
      {children}
    </button>
  );
}
