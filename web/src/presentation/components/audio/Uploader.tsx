"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/presentation/components/ui/Button";
import {
  ACCEPTED_AUDIO_EXTENSIONS,
  MAX_DURATION_S,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
} from "@/infrastructure/audio/decode";

export function Uploader({ onSelected }: { onSelected: (blob: Blob) => void }) {
  const t = useTranslations("analyze");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setError(t("errorWrongFormat"));
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(t("errorFileTooLarge", { size: MAX_UPLOAD_MB }));
      return;
    }
    setError(null);
    onSelected(file);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFile(e.dataTransfer.files[0]);
        }}
        className={`flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? "border-brand-500 bg-brand-50" : "border-brand-100"
        }`}
      >
        <p className="text-ink-600">{t("uploadHint")}</p>
        <Button onClick={() => inputRef.current?.click()}>{t("selectFile")}</Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_AUDIO_EXTENSIONS}
          className="sr-only"
          aria-label={t("selectFile")}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
      <p className="text-xs text-ink-600">
        {t("audioLimitsHint", { seconds: MAX_DURATION_S, size: MAX_UPLOAD_MB })}
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
