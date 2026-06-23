"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { isValidMicrochip } from "@/domain/cat/cat";
import type { Cat, CatDraft, CatSex } from "@/domain/cat/cat";
import type { CatId } from "@/domain/shared/ids";
import { useCats } from "@/presentation/hooks/useCats";
import { Button } from "@/presentation/components/ui/Button";
import { ConfirmDialog } from "@/presentation/components/ui/ConfirmDialog";
import { useAuth } from "@/presentation/hooks/useAuth";
import { SignInGate } from "@/presentation/components/auth/SignInGate";
import { container } from "@/presentation/state/composition";
import { optimizeImage, IMAGE_PRESETS, ImageOptimizeError } from "@/infrastructure/media/optimize-image";

/** Circular cat avatar: the stored (optimized) photo if present, else an emoji
 *  placeholder. `bump` forces a reload after the photo changes. */
function CatAvatar({ catId, bump, className }: { catId: CatId; bump: number; className: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let created: string | null = null;
    void container.catPhotos.get(catId).then((blob) => {
      if (!active) return;
      if (!blob) {
        setUrl(null);
        return;
      }
      created = URL.createObjectURL(blob);
      setUrl(created);
    });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [catId, bump]);

  if (!url) {
    return (
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center rounded-full bg-brand-50 text-2xl ring-1 ring-brand-100 ${className}`}
      >
        🐈
      </span>
    );
  }
  return (
    <Image
      src={url}
      alt=""
      width={96}
      height={96}
      unoptimized
      className={`shrink-0 rounded-full object-cover ring-1 ring-brand-200 ${className}`}
    />
  );
}

export function CatManager() {
  const t = useTranslations("cats");
  const { accountsEnabled, isAuthenticated, status } = useAuth();
  const { cats, loading, create, update, remove } = useCats();
  const [editing, setEditing] = useState<Cat | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Cat | null>(null);
  // Bumped whenever a photo is saved, to refresh the avatars (photos live in a
  // separate store, so the `cats` list reference doesn't change on a photo edit).
  const [photoBump, setPhotoBump] = useState(0);

  // Cat profiles are a registered-only feature once accounts are live.
  if (accountsEnabled && !isAuthenticated) {
    if (status === "loading") return null;
    return <SignInGate context="cats" />;
  }

  if (loading) return <p className="text-ink-600">…</p>;

  /** Persist the draft, then (if provided) the optimized photo on the cat id. */
  const handleSubmit = async (draft: CatDraft, photo: Blob | null): Promise<boolean> => {
    const res = editing === "new" ? await create(draft) : await update((editing as Cat).id, draft);
    if (!res.ok) return false;
    if (photo) {
      await container.catPhotos.put(res.value.id, photo);
      setPhotoBump((n) => n + 1);
    }
    setEditing(null);
    return true;
  };

  return (
    <div className="flex flex-col gap-6">
      {cats.length === 0 && !editing && <p className="text-ink-600">{t("empty")}</p>}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cats.map((cat) => (
          <li key={cat.id} className="rounded-2xl border border-brand-100 p-5">
            <div className="flex items-center gap-3">
              <CatAvatar catId={cat.id} bump={photoBump} className="size-12" />
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">{cat.name}</h2>
                <p className="mt-0.5 truncate text-sm text-ink-600">
                  {[cat.breed, cat.birthYear ? `${new Date().getFullYear() - cat.birthYear}y` : null]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="ghost" onClick={() => setEditing(cat)}>
                {t("edit")}
              </Button>
              <Button variant="ghost" onClick={() => setDeleteTarget(cat)}>
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
          onSubmit={handleSubmit}
        />
      ) : (
        <Button className="self-start" onClick={() => setEditing("new")}>
          ➕ {t("add")}
        </Button>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t("delete")}
        message={t("confirmDelete")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        destructive
        onConfirm={() => {
          if (deleteTarget) void remove(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function CatForm({
  cat,
  onSubmit,
  onCancel,
}: {
  cat: Cat | null;
  onSubmit: (draft: CatDraft, photo: Blob | null) => Promise<boolean>;
  onCancel: () => void;
}) {
  const t = useTranslations("cats");
  const [name, setName] = useState(cat?.name ?? "");
  const [birthYear, setBirthYear] = useState(cat?.birthYear?.toString() ?? "");
  const [breed, setBreed] = useState(cat?.breed ?? "");
  const [sex, setSex] = useState<CatSex>(cat?.sex ?? "unknown");
  const [traits, setTraits] = useState((cat?.traits ?? []).join(", "));
  const [microchip, setMicrochip] = useState(cat?.microchip ?? "");
  const [error, setError] = useState(false);

  // Optimized photo blob to save on submit + its preview object URL.
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const photoUrlRef = useRef<string | null>(null);

  const setPreview = (blob: Blob | null) => {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    const url = blob ? URL.createObjectURL(blob) : null;
    photoUrlRef.current = url;
    setPhotoUrl(url);
  };

  // Show the existing photo (when editing) and clean up the preview on unmount.
  useEffect(() => {
    let active = true;
    if (cat) {
      void container.catPhotos.get(cat.id).then((blob) => {
        if (active && blob) setPreview(blob);
      });
    }
    return () => {
      active = false;
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
      photoUrlRef.current = null;
    };
  }, [cat]);

  const onPickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError(false);
    try {
      const blob = await optimizeImage(file, IMAGE_PRESETS.avatar);
      setPhoto(blob);
      setPreview(blob);
    } catch (e) {
      if (e instanceof ImageOptimizeError) setPhotoError(true);
      else throw e;
    }
  };

  const microchipInvalid = microchip.trim().length > 0 && !isValidMicrochip(microchip.trim());

  return (
    <form
      className="flex flex-col gap-4 rounded-2xl border border-brand-100 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (microchipInvalid) return;
        const ok = await onSubmit(
          {
            name,
            birthYear: birthYear ? Number(birthYear) : null,
            breed: breed || null,
            sex,
            traits: traits
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
            microchip: microchip.trim() || null,
          },
          photo,
        );
        if (!ok) setError(true);
      }}
    >
      <div className="flex items-center gap-4">
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt=""
            width={128}
            height={128}
            unoptimized
            className="size-16 shrink-0 rounded-full object-cover ring-1 ring-brand-200"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-brand-50 text-3xl ring-1 ring-brand-100"
          >
            🐈
          </span>
        )}
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("photo")}</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => void onPickPhoto(e.target.files?.[0])}
            className="block w-full text-sm text-ink-600 file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:font-medium file:text-white"
          />
          {photoError && (
            <span role="alert" className="mt-1 block text-xs text-red-700 dark:text-red-300">
              {t("photoError")}
            </span>
          )}
        </label>
      </div>

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
      <label className="text-sm">
        <span className="mb-1 block font-medium">{t("traits")}</span>
        <input
          value={traits}
          onChange={(e) => setTraits(e.target.value)}
          placeholder={t("traitsHint")}
          className="min-h-11 w-full rounded-lg border border-brand-100 px-3"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium">{t("microchip")}</span>
        <input
          value={microchip}
          inputMode="numeric"
          aria-invalid={microchipInvalid}
          onChange={(e) => setMicrochip(e.target.value)}
          placeholder={t("microchipHint")}
          className="min-h-11 w-full rounded-lg border border-brand-100 px-3"
        />
        {microchipInvalid && (
          <span role="alert" className="mt-1 block text-xs text-red-700 dark:text-red-300">
            {t("microchipInvalid")}
          </span>
        )}
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
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
