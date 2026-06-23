"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useAccess } from "@/presentation/hooks/useAccess";
import { useCats } from "@/presentation/hooks/useCats";
import { container } from "@/presentation/state/composition";
import { SignInGate } from "@/presentation/components/auth/SignInGate";
import { Button } from "@/presentation/components/ui/Button";
import { ConfirmDialog } from "@/presentation/components/ui/ConfirmDialog";
import { VACCINES, VACCINE_REGIONS, requirementFor, type VaccineRegion } from "@/content/vaccines";
import type { VaccinationRecord } from "@/domain/cat/vaccination";
import type { CatId } from "@/domain/shared/ids";
import type { AppLocale } from "@/i18n/routing";

const REGION_SETTING_KEY = "medical.region";

/**
 * Per-cat vaccine checklist. The region selector recomputes each vaccine's
 * requirement (legal/recommended/optional); the user records each dose with a
 * date (multiple doses per vaccine — the booster history), persisted locally
 * (IndexedDB `vaccinations`). Doses show as chips; hovering/focusing a chip
 * reveals an X that deletes it via a themed confirm dialog. Registered-only.
 */
export function VaccineChecklist() {
  const t = useTranslations("medical");
  const locale = useLocale() as AppLocale;
  const { isRegistered, status } = useAccess();
  const { cats } = useCats();

  const [catId, setCatId] = useState<CatId | null>(null);
  const [region, setRegion] = useState<VaccineRegion>("eu");
  const [records, setRecords] = useState<readonly VaccinationRecord[]>([]);
  const [deleteRec, setDeleteRec] = useState<VaccinationRecord | null>(null);

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
  if (!isRegistered) return <SignInGate context="medical" />;

  const changeRegion = (r: VaccineRegion) => {
    setRegion(r);
    void container.settings.set(REGION_SETTING_KEY, r);
  };

  /** All recorded doses for a vaccine, newest first (getByCat already sorts). */
  const dosesFor = (vaccineId: string): readonly VaccinationRecord[] =>
    records.filter((r) => r.vaccineId === vaccineId);

  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(locale);

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

  const confirmDelete = async () => {
    if (!deleteRec || !catId) return;
    await container.vaccinations.delete(deleteRec.id);
    setRecords(await container.vaccinations.getByCat(catId));
    setDeleteRec(null);
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
            const doses = dosesFor(v.id);
            return (
              <li key={v.id} className="rounded-xl border border-brand-100 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
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
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700 dark:text-brand-300">
                        {t(`level_${v.level}`)}
                      </span>
                    </p>
                    {/* Dose history: each recorded date is a chip; hover/focus reveals an X. */}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {doses.length === 0 ? (
                        <span className="text-xs text-ink-600">{t("notRecorded")}</span>
                      ) : (
                        doses.map((rec) => (
                          <span
                            key={rec.id}
                            className="group inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-ink-700 ring-1 ring-brand-100"
                          >
                            {fmtDate(rec.administeredOn)}
                            <button
                              type="button"
                              aria-label={t("removeDose", { date: fmtDate(rec.administeredOn) })}
                              onClick={() => setDeleteRec(rec)}
                              className="ml-0.5 rounded-full leading-none text-ink-400 opacity-0 transition-opacity hover:text-red-700 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 dark:hover:text-red-300"
                            >
                              ✕
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <form
                    className="flex shrink-0 items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const input = form.elements.namedItem("d") as HTMLInputElement;
                      void markGiven(v.id, input.value).then(() => form.reset());
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
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={deleteRec !== null}
        title={t("deleteDoseTitle")}
        message={deleteRec ? t("deleteDoseMessage", { date: fmtDate(deleteRec.administeredOn) }) : ""}
        confirmLabel={t("deleteDose")}
        cancelLabel={t("cancel")}
        destructive
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteRec(null)}
      />
    </div>
  );
}
