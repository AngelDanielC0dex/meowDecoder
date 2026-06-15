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
    breed: draft.breed?.trim() || null,
    sex: draft.sex ?? "unknown",
    traits: draft.traits ?? [],
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

  const updated: Cat = {
    ...existing,
    name: draft.name.trim(),
    birthYear: draft.birthYear ?? existing.birthYear,
    breed: draft.breed !== undefined ? draft.breed?.trim() || null : existing.breed,
    sex: draft.sex ?? existing.sex,
    traits: draft.traits ?? existing.traits,
    updatedAt: Date.now(),
  };
  await repo.save(updated);
  return ok(updated);
}
