import { err, ok, type Result } from "@/domain/shared/result";
import { newCatId, type CatId } from "@/domain/shared/ids";
import { validateCatDraft, type Cat, type CatDraft } from "@/domain/cat/cat";
import type { CatRepository } from "../ports/repositories";

export async function createCat(repo: CatRepository, draft: CatDraft): Promise<Result<Cat>> {
  const invalid = validateCatDraft(draft);
  if (invalid) return err({ code: invalid, message: `Invalid cat draft: ${invalid}` });

  const now = Date.now();
  const cat: Cat = {
    id: newCatId(),
    name: draft.name.trim(),
    birthYear: draft.birthYear ?? null,
    birthDate: draft.birthDate?.trim() || null,
    breed: draft.breed?.trim() || null,
    sex: draft.sex ?? "unknown",
    traits: draft.traits ?? [],
    microchip: draft.microchip?.trim() || null,
    bio: draft.bio?.trim() || null,
    cardTemplate: draft.cardTemplate ?? "classic",
    showHoroscope: draft.showHoroscope ?? false,
    createdAt: now,
    updatedAt: now,
  };
  await repo.save(cat);
  return ok(cat);
}

export async function updateCat(
  repo: CatRepository,
  id: CatId,
  draft: CatDraft,
): Promise<Result<Cat>> {
  const existing = await repo.getById(id);
  if (!existing) return err({ code: "cat/not-found", message: `Cat ${id} not found` });

  const invalid = validateCatDraft(draft);
  if (invalid) return err({ code: invalid, message: `Invalid cat draft: ${invalid}` });

  // Only overwrite a field when the draft explicitly provides it (undefined =
  // "leave as-is"), so partial updates from different forms never clobber data.
  const updated: Cat = {
    ...existing,
    name: draft.name.trim(),
    birthYear: draft.birthYear ?? existing.birthYear,
    birthDate: draft.birthDate !== undefined ? draft.birthDate?.trim() || null : existing.birthDate,
    breed: draft.breed !== undefined ? draft.breed?.trim() || null : existing.breed,
    sex: draft.sex ?? existing.sex,
    traits: draft.traits ?? existing.traits,
    microchip:
      draft.microchip !== undefined ? draft.microchip?.trim() || null : existing.microchip ?? null,
    bio: draft.bio !== undefined ? draft.bio?.trim() || null : existing.bio,
    cardTemplate: draft.cardTemplate ?? existing.cardTemplate,
    showHoroscope: draft.showHoroscope ?? existing.showHoroscope,
    updatedAt: Date.now(),
  };
  await repo.save(updated);
  return ok(updated);
}
