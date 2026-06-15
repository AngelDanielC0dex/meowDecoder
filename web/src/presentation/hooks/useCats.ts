"use client";

import { useCallback, useEffect, useState } from "react";
import type { Cat, CatDraft } from "@/domain/cat/cat";
import type { CatId } from "@/domain/shared/ids";
import { createCat, updateCat } from "@/application/use-cases/manage-cats";
import { container } from "@/presentation/state/composition";

export function useCats() {
  const [cats, setCats] = useState<readonly Cat[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setCats(await container.cats.getAll());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (draft: CatDraft) => {
      const res = await createCat(container.cats, draft);
      if (res.ok) await refresh();
      return res;
    },
    [refresh],
  );

  const update = useCallback(
    async (id: CatId, draft: CatDraft) => {
      const res = await updateCat(container.cats, id, draft);
      if (res.ok) await refresh();
      return res;
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: CatId) => {
      await container.cats.delete(id);
      await refresh();
    },
    [refresh],
  );

  return { cats, loading, create, update, remove, refresh };
}
