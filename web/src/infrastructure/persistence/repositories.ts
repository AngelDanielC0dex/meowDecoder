import type {
  CatPhotoRepository,
  CatPriorsRepository,
  CatRepository,
  FeedbackRepository,
  SessionRepository,
  SettingsRepository,
  VaccinationRepository,
} from "@/application/ports/repositories";
import { normalizeCat, type Cat } from "@/domain/cat/cat";
import type { AnalysisSession } from "@/domain/analysis/session";
import type { FeedbackEntry } from "@/domain/feedback/feedback";
import type { VaccinationRecord, VaccinationDraft } from "@/domain/cat/vaccination";
import {
  emptyCatPriors,
  reinforceCatPriors,
  type CatPriors,
  type CorrectableClass,
} from "@/domain/analysis/cat-priors";
import type { CatId, SessionId } from "@/domain/shared/ids";
import { getDb } from "./db";
import { purgeOldAudioIfNeeded } from "./storage-manager";

export class IdbCatRepository implements CatRepository {
  async getAll(): Promise<readonly Cat[]> {
    const db = await getDb();
    const cats = await db.getAll("cats");
    return cats.map(normalizeCat).sort((a, b) => a.createdAt - b.createdAt);
  }
  async getById(id: CatId): Promise<Cat | null> {
    const cat = await (await getDb()).get("cats", id);
    return cat ? normalizeCat(cat) : null;
  }
  async save(cat: Cat): Promise<void> {
    await (await getDb()).put("cats", cat);
  }
  async delete(id: CatId): Promise<void> {
    const db = await getDb();
    // Cascade: a deleted cat takes its photo with it (no orphan blobs).
    await Promise.all([db.delete("cats", id), db.delete("catPhotos", id)]);
  }
}

/** Per-cat photo blob, stored locally (IndexedDB). Used by the presentation card. */
export class IdbCatPhotoRepository implements CatPhotoRepository {
  async get(catId: CatId): Promise<Blob | null> {
    const entry = await (await getDb()).get("catPhotos", catId);
    return entry?.blob ?? null;
  }
  async put(catId: CatId, blob: Blob): Promise<void> {
    await (await getDb()).put("catPhotos", { catId, blob, updatedAt: Date.now() });
  }
  async delete(catId: CatId): Promise<void> {
    await (await getDb()).delete("catPhotos", catId);
  }
}

export class IdbSessionRepository implements SessionRepository {
  async save(session: AnalysisSession, audio: Blob | null): Promise<void> {
    const db = await getDb();
    const tx = db.transaction(["sessions", "audio"], "readwrite");
    await tx.objectStore("sessions").put(session);
    if (audio && session.audioKey) {
      await tx
        .objectStore("audio")
        .put({ key: session.audioKey, blob: audio, createdAt: session.createdAt });
    }
    await tx.done;
    // Keep on-device audio under the storage budget. Fire-and-forget so it never
    // blocks the result; only needed when a blob was actually stored.
    if (audio && session.audioKey) void purgeOldAudioIfNeeded(db);
  }

  async getRecent(limit: number, catId?: CatId): Promise<readonly AnalysisSession[]> {
    const db = await getDb();
    const out: AnalysisSession[] = [];
    let cursor = await db
      .transaction("sessions")
      .store.index("by-createdAt")
      .openCursor(null, "prev");
    while (cursor && out.length < limit) {
      if (!catId || cursor.value.catId === catId) out.push(cursor.value);
      cursor = await cursor.continue();
    }
    return out;
  }

  async getById(id: SessionId): Promise<AnalysisSession | null> {
    return (await (await getDb()).get("sessions", id)) ?? null;
  }

  async getAudio(audioKey: string): Promise<Blob | null> {
    const entry = await (await getDb()).get("audio", audioKey);
    return entry?.blob ?? null;
  }

  async delete(id: SessionId): Promise<void> {
    const db = await getDb();
    const session = await db.get("sessions", id);
    const tx = db.transaction(["sessions", "audio"], "readwrite");
    await tx.objectStore("sessions").delete(id);
    if (session?.audioKey) await tx.objectStore("audio").delete(session.audioKey);
    await tx.done;
  }
}

export class IdbFeedbackRepository implements FeedbackRepository {
  async save(entry: FeedbackEntry): Promise<void> {
    await (await getDb()).put("feedback", entry);
  }
  async getBySession(sessionId: SessionId): Promise<FeedbackEntry | null> {
    const all = await (await getDb()).getAllFromIndex("feedback", "by-session", sessionId);
    return all[0] ?? null;
  }
  async getShareable(): Promise<readonly FeedbackEntry[]> {
    const all = await (await getDb()).getAll("feedback");
    return all.filter((f) => f.sharedForTraining);
  }
}

export class IdbSettingsRepository implements SettingsRepository {
  async get<T>(key: string): Promise<T | null> {
    const entry = await (await getDb()).get("settings", key);
    return (entry?.value as T | undefined) ?? null;
  }
  async set<T>(key: string, value: T): Promise<void> {
    await (await getDb()).put("settings", { key, value });
  }
}

export class IdbCatPriorsRepository implements CatPriorsRepository {
  async get(catId: CatId): Promise<CatPriors> {
    const entry = await (await getDb()).get("catPriors", catId);
    return entry?.priors ?? emptyCatPriors();
  }

  async reinforce(catId: CatId, cls: CorrectableClass): Promise<void> {
    const db = await getDb();
    const tx = db.transaction("catPriors", "readwrite");
    const existing = await tx.store.get(catId);
    const priors = reinforceCatPriors(existing?.priors ?? emptyCatPriors(), cls);
    await tx.store.put({ catId, priors });
    await tx.done;
  }
}

export class IdbVaccinationRepository implements VaccinationRepository {
  async getByCat(catId: CatId): Promise<readonly VaccinationRecord[]> {
    const records = await (await getDb()).getAllFromIndex("vaccinations", "by-cat", catId);
    return records.sort((a, b) => b.administeredOn - a.administeredOn);
  }

  async add(draft: VaccinationDraft): Promise<VaccinationRecord> {
    const record: VaccinationRecord = { ...draft, id: crypto.randomUUID() };
    await (await getDb()).put("vaccinations", record);
    return record;
  }

  async delete(id: string): Promise<void> {
    await (await getDb()).delete("vaccinations", id);
  }
}
