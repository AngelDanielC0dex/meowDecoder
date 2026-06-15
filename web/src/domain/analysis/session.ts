import type { CatId, SessionId } from "../shared/ids";
import type { AnalyzedSegment } from "./features";
import type { Classification } from "./classification";

export type AudioSourceKind = "microphone" | "file";

/**
 * One completed analysis: the unit of history.
 * Audio itself is stored separately (blob) and only locally unless the user
 * explicitly donates it — privacy by design.
 */
export interface AnalysisSession {
  readonly id: SessionId;
  readonly catId: CatId | null;
  readonly createdAt: number; // epoch ms — serializable, timezone-agnostic
  readonly source: AudioSourceKind;
  readonly recordingDurationS: number;
  readonly segment: AnalyzedSegment;
  readonly classification: Classification;
  /** Key of the locally stored audio blob, if kept. */
  readonly audioKey: string | null;
}
