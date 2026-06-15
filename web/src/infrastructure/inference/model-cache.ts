import { getDb } from "../persistence/db";

/**
 * Versioned model binary cache in IndexedDB.
 * First load: network → IndexedDB → memory. Later sessions: IndexedDB only.
 * Different versions coexist; stale ones are pruned after a successful fetch.
 */
export async function getCachedModel(url: string, version: string): Promise<ArrayBuffer> {
  const db = await getDb();
  const key = `${version}:${url}`;
  const cached = await db.get("modelCache", key);
  if (cached) return cached.bytes;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`model fetch failed: ${response.status}`);
  const bytes = await response.arrayBuffer();

  const tx = db.transaction("modelCache", "readwrite");
  await tx.store.put({ key, version, bytes, cachedAt: Date.now() });
  // Prune older versions of the same artifact
  for (const existingKey of await tx.store.getAllKeys()) {
    if (existingKey !== key && String(existingKey).endsWith(`:${url}`)) {
      await tx.store.delete(existingKey);
    }
  }
  await tx.done;
  return bytes;
}
