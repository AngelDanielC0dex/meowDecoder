import type { Cat } from "@/domain/cat/cat";
import type { AnalysisSession } from "@/domain/analysis/session";
import type { FeedbackEntry } from "@/domain/feedback/feedback";
import type { CatPriors, CorrectableClass } from "@/domain/analysis/cat-priors";
import type { VaccinationRecord, VaccinationDraft } from "@/domain/cat/vaccination";
import type { CatId, SessionId } from "@/domain/shared/ids";

export interface CatRepository {
  getAll(): Promise<readonly Cat[]>;
  getById(id: CatId): Promise<Cat | null>;
  save(cat: Cat): Promise<void>;
  delete(id: CatId): Promise<void>;
}

export interface CatPhotoRepository {
  get(catId: CatId): Promise<Blob | null>;
  put(catId: CatId, blob: Blob): Promise<void>;
  delete(catId: CatId): Promise<void>;
}

export interface SessionRepository {
  save(session: AnalysisSession, audio: Blob | null): Promise<void>;
  getRecent(limit: number, catId?: CatId): Promise<readonly AnalysisSession[]>;
  getById(id: SessionId): Promise<AnalysisSession | null>;
  getAudio(audioKey: string): Promise<Blob | null>;
  delete(id: SessionId): Promise<void>;
}

export interface FeedbackRepository {
  save(entry: FeedbackEntry): Promise<void>;
  getBySession(sessionId: SessionId): Promise<FeedbackEntry | null>;
  /** Pending entries the user agreed to share, for future upload. */
  getShareable(): Promise<readonly FeedbackEntry[]>;
}

export interface SettingsRepository {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

export interface CatPriorsRepository {
  /** Returns the cat's learned priors, or uniform priors if none yet. */
  get(catId: CatId): Promise<CatPriors>;
  /** Reinforces one class for a cat (called when a correction is recorded). */
  reinforce(catId: CatId, cls: CorrectableClass): Promise<void>;
}

export interface VaccinationRepository {
  getByCat(catId: CatId): Promise<readonly VaccinationRecord[]>;
  add(draft: VaccinationDraft): Promise<VaccinationRecord>;
  delete(id: string): Promise<void>;
}
