"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Cat, CatDraft, CatSex } from "@/domain/cat/cat";
import type { CatId } from "@/domain/shared/ids";
import { useCats } from "@/presentation/hooks/useCats";
import { Button } from "@/presentation/components/ui/Button";

export function CatManager() {
  const t = useTranslations("cats");
  const { cats, loading, create, update, remove } = useCats();
  const [editing, setEditing] = useState<Cat | "new" | null>(null);

  if (loading) return <p className="text-ink-600">…</p>;

  return (
    <div className="flex flex-col gap-6">
      {cats.length === 0 && !editing && <p className="text-ink-600">{t("empty")}</p>}

      <ul className="grid gap-4 sm:grid-cols-2">
        {cats.map((cat) => (
          <li key={cat.id} className="rounded-2xl border border-brand-100 p-5">
            <h2 className="text-lg font-semibold">🐈 {cat.name}</h2>
            <p className="mt-1 text-sm text-ink-600">
              {[cat.breed, cat.birthYear ? `${new Date().getFullYear() - cat.birthYear}y` : null]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="ghost" onClick={() => setEditing(cat)}>
                {t("edit")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  if (confirm(t("confirmDelete"))) void remove(cat.id);
                }}
              >
                {t("delete")}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {editing ? (
        <CatForm
          cat={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSubmit={async (draft) => {
            const res =
              editing === "new"
                ? await create(draft)
                : await update((editing as Cat).id as CatId, draft);
            if (res.ok) setEditing(null);
            return res.ok;
          }}
        />
      ) : (
        <Button className="self-start" onClick={() => setEditing("new")}>
          ➕ {t("add")}
        </Button>
      )}
    </div>
  );
}

function CatForm({
  cat,
  onSubmit,
  onCancel,
}: {
  cat: Cat | null;
  onSubmit: (draft: CatDraft) => Promise<boolean>;
  onCancel: () => void;
}) {
  const t = useTranslations("cats");
  const [name, setName] = useState(cat?.name ?? "");
  const [birthYear, setBirthYear] = useState(cat?.birthYear?.toString() ?? "");
  const [breed, setBreed] = useState(cat?.breed ?? "");
  const [sex, setSex] = useState<CatSex>(cat?.sex ?? "unknown");
  const [error, setError] = useState(false);

  return (
    <form
      className="flex flex-col gap-4 rounded-2xl border border-brand-100 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await onSubmit({
          name,
          birthYear: birthYear ? Number(birthYear) : null,
          breed: breed || null,
          sex,
        });
        if (!ok) setError(true);
      }}
    >
      <label className="text-sm">
        <span className="mb-1 block font-medium">{t("name")} *</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-h-11 w-full rounded-lg border border-brand-100 px-3"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("birthYear")}</span>
          <input
            type="number"
            inputMode="numeric"
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            className="min-h-11 w-full rounded-lg border border-brand-100 px-3"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("sex")}</span>
          <select
            value={sex}
            onChange={(e) => setSex(e.target.value as CatSex)}
            className="min-h-11 w-full rounded-lg border border-brand-100 px-3"
          >
            <option value="unknown">{t("sexUnknown")}</option>
            <option value="female">{t("sexFemale")}</option>
            <option value="male">{t("sexMale")}</option>
          </select>
        </label>
      </div>
      <label className="text-sm">
        <span className="mb-1 block font-medium">{t("breed")}</span>
        <input
          value={breed}
          onChange={(e) => setBreed(e.target.value)}
          className="min-h-11 w-full rounded-lg border border-brand-100 px-3"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {t("name")} *
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit">{t("save")}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
