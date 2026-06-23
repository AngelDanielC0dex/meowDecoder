"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useAccess } from "@/presentation/hooks/useAccess";
import { useCats } from "@/presentation/hooks/useCats";
import { container } from "@/presentation/state/composition";
import { SignInGate } from "@/presentation/components/auth/SignInGate";
import { Button } from "@/presentation/components/ui/Button";
import type { CatId } from "@/domain/shared/ids";
import type { AppLocale } from "@/i18n/routing";

type Mode = "medical" | "meow";
interface Msg {
  role: "user" | "assistant";
  text: string;
}

/**
 * Premium AI assistant chat. RAG by context injection: we gather the selected
 * cat's local data (profile + recent meow analyses) and send it with the
 * question; the server adds guardrails and calls the LLM. Gated to registered
 * users; non-premium see an upsell. A persistent disclaimer reinforces
 * "informational, not a veterinarian".
 *
 * `lockedMode` pins the assistant to one context and hides the mode tabs: it is
 * embedded in the meow history (`meow`) and the medical log (`medical`). The
 * caller only renders it when `premium.enabled` is on, so when premium is
 * disabled the chatbot does not appear anywhere.
 */
export function AssistantChat({ lockedMode }: { lockedMode?: Mode } = {}) {
  const t = useTranslations("assistant");
  const locale = useLocale() as AppLocale;
  const { isRegistered, isPremium, status } = useAccess();
  const { cats } = useCats();

  const [mode, setMode] = useState<Mode>(lockedMode ?? "meow");
  const [catId, setCatId] = useState<CatId | null>(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "loading") return null;
  if (!isRegistered) return <SignInGate context="assistant" />;
  // Premium-only feature. Until billing ships usePremium() is false, so this
  // shows the upsell; flipping usePremium activates the chat with no other change.
  if (!isPremium) {
    return (
      <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-6 text-center">
        <p className="text-2xl" aria-hidden="true">✨</p>
        <p className="mt-2 font-semibold">{t("premiumTitle")}</p>
        <p className="mt-1 text-sm text-ink-600">{t("premiumBody")}</p>
      </div>
    );
  }

  async function buildContext() {
    const cat = cats.find((c) => c.id === catId);
    const recent = await container.sessions.getRecent(8, catId ?? undefined);
    return {
      ...(cat?.name ? { name: cat.name } : {}),
      ...(cat?.breed ? { breed: cat.breed } : {}),
      ...(cat?.birthYear ? { ageYears: new Date().getFullYear() - cat.birthYear } : {}),
      recentMeows: recent.map((s) => ({
        cls: s.classification.primary.cls,
        confidence: s.classification.primary.probability,
        date: new Date(s.createdAt).toISOString().slice(0, 10),
      })),
    };
  }

  async function send() {
    const q = question.trim();
    if (!q || loading) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setQuestion("");
    setError(null);
    setLoading(true);
    try {
      const context = await buildContext();
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, locale, question: q, context }),
      });
      if (!res.ok) {
        setError(res.status === 429 ? t("errorRate") : t("errorGeneric"));
        return;
      }
      const data = (await res.json()) as { answer?: string };
      if (data.answer) setMessages((m) => [...m, { role: "assistant", text: data.answer! }]);
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p role="note" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
        ⚠️ {t("disclaimer")}
      </p>

      {/* Mode tabs only when the assistant is standalone; embedded instances pin
          the mode (meow in history, medical in the medical log) via lockedMode. */}
      {!lockedMode && (
        <div role="tablist" aria-label={t("modeLabel")} className="flex gap-2">
          {(["meow", "medical"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`min-h-11 flex-1 rounded-xl px-4 text-sm font-medium transition-colors ${
                mode === m ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700 ring-1 ring-brand-200"
              }`}
            >
              {t(`mode_${m}`)}
            </button>
          ))}
        </div>
      )}

      {cats.length > 0 && (
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("selectCat")}</span>
          <select
            value={catId ?? ""}
            onChange={(e) => setCatId(e.target.value ? (e.target.value as CatId) : null)}
            className="min-h-11 w-full rounded-lg border border-brand-200 bg-surface px-3"
          >
            <option value="">{t("noCat")}</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      )}

      <div role="log" aria-live="polite" aria-busy={loading} className="flex min-h-40 flex-col gap-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
              m.role === "user"
                ? "self-end bg-brand-600 text-white"
                : "self-start bg-brand-50 text-ink-900"
            }`}
          >
            {m.text}
          </div>
        ))}
        {loading && <p className="self-start text-sm text-ink-600">{t("thinking")}</p>}
      </div>

      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          className="min-h-11 flex-1 rounded-lg border border-brand-200 bg-surface px-3"
        />
        <Button type="submit" disabled={loading || !question.trim()}>
          {t("send")}
        </Button>
      </form>
    </div>
  );
}
