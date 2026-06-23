"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useAccess } from "@/presentation/hooks/useAccess";
import { useCats } from "@/presentation/hooks/useCats";
import { container } from "@/presentation/state/composition";
import { SignInGate } from "@/presentation/components/auth/SignInGate";
import { Button } from "@/presentation/components/ui/Button";
import { VACCINES, VACCINE_REGIONS, requirementFor, type VaccineRegion } from "@/content/vaccines";
import type { VaccinationRecord } from "@/domain/cat/vaccination";
import type { CatId } from "@/domain/shared/ids";
import type { AppLocale } from "@/i18n/routing";

const REGION_SETTING_KEY = "medical.region";

/**
 * Per-cat vaccine checklist. The region selector recomputes each vaccine's
 * requirement (legal/recommended/optional); the user marks doses with a date,
 * persisted locally (IndexedDB `vaccinations`). Registered-only feature (the
 * medical log moved out of premium): anonymous users see the sign-in gate.
 * Distinguishes WSAVA "core" from legal requirement — honest by construction
 * (see content/vaccines.ts).
 */
export function VaccineChecklist() {
  const t = useTranslations("medical");
  const locale = useLocale() as AppLocale;
  const { isRegistered, status } = useAccess();
  const { cats } = useCats();

  const [catId, setCatId] = useState<CatId | null>(null);
  const [region, setRegion] = useState<VaccineRegion>("eu");
  const [records, setRecords] = useState<readonly VaccinationRecord[]>([]);

  useEffect(() => {
    void container.settings.get<VaccineRegion>(REGION_SETTING_KEY).then((r) => {
      if (r) setRegion(r);
    });
  }, []);

  useEffect(() => {
    if (!catId) {
      setRecords([]);
      return;
    }
    void container.vaccinations.getByCat(catId).then(setRecords);
  }, [catId]);

  if (status === "loading") return null;
  // Registered-only (no longer premium): the medical log is part of the free
  // account experience; only the AI assistant on top of it stays premium.
  if (!isRegistered) return <SignInGate context="medical" />;

  const changeRegion = (r: VaccineRegion) => {
    setRegion(r);
    void container.settings.set(REGION_SETTING_KEY, r);
  };

  const latestFor = (vaccineId: string): VaccinationRecord | undefined =>
    records.find((r) => r.vaccineId === vaccineId);

  const markGiven = async (vaccineId: string, dateStr: string) => {
    if (!catId || !dateStr) return;
    await container.vaccinations.add({
      catId,
      vaccineId,
      administeredOn: new Date(dateStr).getTime(),
      nextDueOn: null,
      notes: null,
    });
    setRecords(await container.vaccinations.getByCat(catId));
  };

  const catName = cats.find((c) => c.id === catId)?.name ?? "cat";

  /** Export the record as portable JSON (no server needed). */
  const exportJson = () => {
    const data = {
      cat: catName,
      region,
      vaccinations: records.map((r) => ({
        vaccine: VACCINES.find((v) => v.id === r.vaccineId)?.name[locale] ?? r.vaccineId,
        administeredOn: new Date(r.administeredOn).toISOString().slice(0, 10),
      })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `carnet-${catName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
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
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("region")}</span>
          <select
            value={region}
            onChange={(e) => changeRegion(e.target.value as VaccineRegion)}
            className="min-h-11 w-full rounded-lg border border-brand-200 bg-surface px-3"
          >
            {VACCINE_REGIONS.map((r) => (
              <option key={r} value={r}>{t(`region_${r}`)}</option>
            ))}
          </select>
        </label>
      </div>

      {catId && (
        <div className="no-print flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            🖨️ {t("printCarnet")}
          </Button>
          <Button variant="ghost" onClick={exportJson}>
            ⬇ {t("exportJson")}
          </Button>
        </div>
      )}

      {!catId ? (
        <p className="text-ink-600">{t("pickCatHint")}</p>
      ) : (
        <ul role="group" aria-label={t("title")} className="flex flex-col gap-3">
          {VACCINES.map((v) => {
            const req = requirementFor(v, region);
            const latest = latestFor(v.id);
            return (
              <li
                key={v.id}
                className="flex flex-col gap-2 rounded-xl border border-brand-100 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{v.name[locale]}</p>
                  <p className="mt-0.5 flex flex-wrap gap-2 text-xs">
                    <span
                      className={`rounded-full px-2 py-0.5 ${
                        req === "legal_required"
                          ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                          : req === "recommended"
                            ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
                            : "bg-ink-200 text-ink-700"
                      }`}
                    >
                      {t(`req_${req}`)}
                    </span>
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700">
                      {t(`level_${v.level}`)}
                    </span>
                    <span className="text-ink-600">
                      {latest
                        ? t("lastGiven", { date: new Date(latest.administeredOn).toLocaleDateString(locale) })
                        : t("notRecorded")}
                    </span>
                  </p>
                </div>
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const input = e.currentTarget.elements.namedItem("d") as HTMLInputElement;
                    void markGiven(v.id, input.value);
                  }}
                >
                  <input
                    type="date"
                    name="d"
                    aria-label={t("dateLabel", { vaccine: v.name[locale] })}
                    max={new Date().toISOString().slice(0, 10)}
                    className="min-h-11 rounded-lg border border-brand-200 bg-surface px-2 text-sm"
                  />
                  <Button type="submit" variant="secondary">{t("markGiven")}</Button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
