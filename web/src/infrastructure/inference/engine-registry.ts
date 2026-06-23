import type { InferenceEngine } from "@/application/ports/inference-engine";
import { HeuristicEngine } from "./heuristic-engine";
import { OnnxEngine } from "./onnx-engine";

/**
 * Engine selection with graceful degradation.
 *
 * Gated entirely by `NEXT_PUBLIC_MODEL_BASE_URL`:
 *   - Empty string or unset → heuristic engine only. We never construct
 *     `OnnxEngine`, never fetch a manifest, never load a model. This is the
 *     safe default while the AI is frozen and is the contract the .env file
 *     advertises.
 *   - Non-empty value       → try the ONNX engine against that base URL. If
 *     the manifest is missing/incompatible or the model fails to load, fall
 *     back to the heuristic engine. This keeps the product independent of
 *     any single ML strategy — a hard product requirement.
 */
export async function selectEngine(): Promise<InferenceEngine> {
  const raw = process.env.NEXT_PUBLIC_MODEL_BASE_URL;
  const base = raw && raw.trim().length > 0 ? raw.trim() : null;
  if (base === null) return new HeuristicEngine();

  const onnx = new OnnxEngine(base);
  const readiness = await onnx.ready();
  if (readiness.ok) return onnx;
  onnx.dispose();
  return new HeuristicEngine();
}
