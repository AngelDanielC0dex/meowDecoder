import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Cat } from "@/domain/cat/cat";
import type { AnalysisSession } from "@/domain/analysis/session";
import type { FeedbackEntry } from "@/domain/feedback/feedback";
import type { CatPriors } from "@/domain/analysis/cat-priors";
import type { VaccinationRecord } from "@/domain/cat/vaccination";

/**
 * IndexedDB schema. Migration strategy: monotonically increasing DB_VERSION;
 * each step in `upgrade` is idempotent and applied sequentially from
 * oldVersion → DB_VERSION. NEVER edit an existing step — append a new one.
 * (Same discipline as SQL migrations; tested in tests/persistence.)
 */
export interface MeowDB extends DBSchema {
  cats: {
    key: string;
    value: Cat;
  };
  sessions: {
    key: string;
    value: AnalysisSession;
    indexes: { "by-createdAt": number; "by-cat": string };
  };
  audio: {
    key: string;
    value: { key: string; blob: Blob; createdAt: number };
  };
  feedback: {
    key: string;
    value: FeedbackEntry;
    indexes: { "by-session": string; "by-shareable": number };
  };
  settings: {
    key: string;
    value: { key: string; value: unknown };
  };
  modelCache: {
    key: string;
    value: { key: string; version: string; bytes: ArrayBuffer; cachedAt: number };
  };
  catPriors: {
    key: string;
    value: { catId: string; priors: CatPriors };
  };
  vaccinations: {
    key: string;
    value: VaccinationRecord;
    indexes: { "by-cat": string };
  };
  catPhotos: {
    key: string;
    value: { catId: string; blob: Blob; updatedAt: number };
  };
}

export const DB_NAME = "meowdecoder";
export const DB_VERSION = 4;

let dbPromise: Promise<IDBPDatabase<MeowDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<MeowDB>> {
  dbPromise ??= openDB<MeowDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // v1 — initial schema
      if (oldVersion < 1) {
        db.createObjectStore("cats", { keyPath: "id" });
        const sessions = db.createObjectStore("sessions", { keyPath: "id" });
        sessions.createIndex("by-createdAt", "createdAt");
        sessions.createIndex("by-cat", "catId");
        db.createObjectStore("audio", { keyPath: "key" });
        const feedback = db.createObjectStore("feedback", { keyPath: "id" });
        feedback.createIndex("by-session", "sessionId");
        feedback.createIndex("by-shareable", "createdAt");
        db.createObjectStore("settings", { keyPath: "key" });
        db.createObjectStore("modelCache", { keyPath: "key" });
      }
      // v2 — per-cat learned priors store (local "improves with use" loop).
      if (oldVersion < 2) {
        db.createObjectStore("catPriors", { keyPath: "catId" });
      }
      // v3 — medical log: administered-vaccine records per cat.
      if (oldVersion < 3) {
        const vaccinations = db.createObjectStore("vaccinations", { keyPath: "id" });
        vaccinations.createIndex("by-cat", "catId");
      }
      // v4 — per-cat photo blob for the presentation card (local-first).
      if (oldVersion < 4) {
        db.createObjectStore("catPhotos", { keyPath: "catId" });
      }
      // v5 — append future migrations BELOW this line, never modify above.
    },
    blocked() {
      // Another tab holds an old version open; the UI treats persistence
      // as temporarily unavailable rather than crashing.
      console.warn("[db] upgrade blocked by another tab");
    },
  });
  return dbPromise;
}

/** Test hook: reset the connection cache (used with fake-indexeddb). */
export function __resetDbForTests(): void {
  dbPromise = null;
}
