import { create } from "zustand";
import type { AnalysisSession, AudioSourceKind } from "@/domain/analysis/session";
import type { CatId } from "@/domain/shared/ids";
import type { PipelineStage } from "@/application/ports/audio-pipeline";
import { analyzeAudio } from "@/application/use-cases/analyze-audio";
import { requestPersistentStorage } from "@/infrastructure/persistence/storage-manager";
import { container } from "./composition";

type Status = "idle" | "processing" | "done" | "error";

interface AnalysisState {
  status: Status;
  stage: PipelineStage | null;
  session: AnalysisSession | null;
  errorCode: string | null;
  selectedCatId: CatId | null;
  keepAudio: boolean;

  setSelectedCat: (id: CatId | null) => void;
  setKeepAudio: (keep: boolean) => void;
  /**
   * `persist` comes from the caller's access tier: registered users save to
   * history, anonymous visitors analyze one-off (the use case skips the save).
   */
  analyze: (audio: Blob, source: AudioSourceKind, persist: boolean) => Promise<void>;
  reset: () => void;
}

/**
 * The single piece of global state in the app: the analysis flow, which spans
 * the recorder, progress UI and result view and must survive intra-page
 * transitions. Everything else uses local state. The store is a thin shell —
 * the real work lives in the analyzeAudio use case.
 */
export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  status: "idle",
  stage: null,
  session: null,
  errorCode: null,
  selectedCatId: null,
  keepAudio: false,

  setSelectedCat: (id) => set({ selectedCatId: id }),
  setKeepAudio: (keep) => set({ keepAudio: keep }),

  analyze: async (audio, source, persist) => {
    set({ status: "processing", stage: "decoding", session: null, errorCode: null });
    const engine = await container.engine();
    const catId = get().selectedCatId;
    // Load this cat's learned priors so corrections shift its predictions.
    const priors = catId ? await container.catPriors.get(catId) : undefined;
    const result = await analyzeAudio(
      {
        pipeline: container.pipeline(),
        engine,
        sessions: container.sessions,
        telemetry: container.telemetry,
      },
      {
        audio,
        source,
        catId,
        keepAudio: get().keepAudio,
        persist,
        ...(priors ? { priors } : {}),
        onProgress: (p) => set({ stage: p.stage }),
      },
    );

    if (result.ok) {
      set({ status: "done", session: result.value, stage: null });
      // Protect IndexedDB from silent eviction on iOS Safari.
      // Fire-and-forget: never blocks the UI or the result display.
      void requestPersistentStorage();
    }
    else set({ status: "error", errorCode: result.error.code, stage: null });
  },

  reset: () => set({ status: "idle", stage: null, session: null, errorCode: null }),
}));
