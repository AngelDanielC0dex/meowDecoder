/**
 * Storage resilience layer for iOS Safari and other browsers that may
 * silently evict IndexedDB data when the device runs low on space.
 *
 * Two defenses:
 * 1. `requestPersistentStorage()` — asks the browser to protect our data.
 * 2. `purgeOldAudioIfNeeded()` — proactively frees space by deleting the
 *    oldest audio blobs (keeping lightweight session metadata intact).
 */

import type { IDBPDatabase } from "idb";
import type { MeowDB } from "./db";

/** Soft quota for audio blobs. Beyond this, oldest blobs get purged. */
const AUDIO_QUOTA_BYTES = 50 * 1024 * 1024; // 50 MB

/** Target usage after purging (70% of quota). */
const PURGE_TARGET_RATIO = 0.7;

/**
 * Request persistent storage so the browser won't silently evict IndexedDB.
 *
 * - iOS Safari 15.2+: supported but may silently deny.
 * - Chrome: grants automatically if the site has engagement.
 * - Firefox: shows a permission prompt.
 *
 * Safe to call multiple times (idempotent). Fire-and-forget — never blocks UI.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  if (!navigator.storage?.persist) return false;

  try {
    const alreadyPersisted = await navigator.storage.persisted();
    if (alreadyPersisted) return true;

    return navigator.storage.persist();
  } catch {
    // Some browsers throw in restrictive contexts (e.g. cross-origin iframes).
    return false;
  }
}

/**
 * Estimate current storage usage and quota.
 * Returns safe defaults if the API is unavailable.
 */
export async function getStorageEstimate(): Promise<{
  usageBytes: number;
  quotaBytes: number;
}> {
  if (typeof navigator === "undefined") return { usageBytes: 0, quotaBytes: Infinity };
  if (!navigator.storage?.estimate) return { usageBytes: 0, quotaBytes: Infinity };

  try {
    const est = await navigator.storage.estimate();
    return {
      usageBytes: est.usage ?? 0,
      quotaBytes: est.quota ?? Infinity,
    };
  } catch {
    return { usageBytes: 0, quotaBytes: Infinity };
  }
}

/**
 * Purge the oldest audio blobs if total storage exceeds the soft quota.
 *
 * Only deletes from the `audio` object store — session metadata (which is
 * lightweight, ~1 KB per entry) is preserved so the user's history remains
 * intact. The `audioKey` on the session will point to a missing blob;
 * the UI should handle this gracefully (show "audio no longer available").
 *
 * @returns The number of audio entries deleted.
 */
export async function purgeOldAudioIfNeeded(
  db: IDBPDatabase<MeowDB>,
): Promise<number> {
  const { usageBytes } = await getStorageEstimate();
  if (usageBytes < AUDIO_QUOTA_BYTES) return 0;

  const targetBytes = AUDIO_QUOTA_BYTES * PURGE_TARGET_RATIO;
  let purged = 0;
  let currentUsage = usageBytes;

  const tx = db.transaction("audio", "readwrite");
  let cursor = await tx.store.openCursor();

  // Iterate oldest-first (IDB default insertion order) and delete until
  // we're below the target or we've exhausted all entries.
  while (cursor && currentUsage > targetBytes) {
    const blobSize = cursor.value.blob?.size ?? 0;
    await cursor.delete();
    currentUsage -= blobSize;
    purged++;
    cursor = await cursor.continue();
  }

  await tx.done;

  if (purged > 0) {
    console.info(`[storage] Purged ${purged} old audio blob(s) to free space.`);
  }

  return purged;
}
