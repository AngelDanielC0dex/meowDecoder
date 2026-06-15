/**
 * Minimal typed request/response RPC over postMessage.
 *
 * Decision (vs comlink): ~70 lines give us discriminated-union message types,
 * explicit transferables and zero dependencies. Comlink's proxy magic hides
 * where the thread boundary is — for an audio pipeline we want that boundary
 * to be loud and explicit.
 */

export interface RpcRequest<M extends string, P> {
  readonly kind: "request";
  readonly id: number;
  readonly method: M;
  readonly payload: P;
}

export type RpcResponse<R> =
  | { readonly kind: "response"; readonly id: number; readonly ok: true; readonly result: R }
  | { readonly kind: "response"; readonly id: number; readonly ok: false; readonly error: string }
  | { readonly kind: "progress"; readonly id: number; readonly stage: string };

let nextId = 1;

export function callWorker<M extends string, P, R>(
  worker: Worker,
  method: M,
  payload: P,
  options?: {
    transfer?: Transferable[];
    onProgress?: (stage: string) => void;
    timeoutMs?: number;
  },
): Promise<R> {
  const id = nextId++;
  return new Promise<R>((resolve, reject) => {
    const timeout = options?.timeoutMs
      ? setTimeout(() => {
          worker.removeEventListener("message", onMessage);
          reject(new Error(`worker call ${method} timed out`));
        }, options.timeoutMs)
      : null;

    const onMessage = (event: MessageEvent<RpcResponse<R>>) => {
      const msg = event.data;
      if (msg.id !== id) return;
      if (msg.kind === "progress") {
        options?.onProgress?.(msg.stage);
        return;
      }
      worker.removeEventListener("message", onMessage);
      if (timeout) clearTimeout(timeout);
      if (msg.ok) resolve(msg.result);
      else reject(new Error(msg.error));
    };

    worker.addEventListener("message", onMessage);
    const req: RpcRequest<M, P> = { kind: "request", id, method, payload };
    worker.postMessage(req, { transfer: options?.transfer ?? [] });
  });
}

type Handler<P, R> = (
  payload: P,
  progress: (stage: string) => void,
) => Promise<{ result: R; transfer?: Transferable[] }> | { result: R; transfer?: Transferable[] };

/** Worker-side dispatcher. Call once in the worker entry file. */
export function serveRpc(
  scope: { onmessage: ((e: MessageEvent) => void) | null; postMessage: Worker["postMessage"] },
  handlers: Record<string, Handler<never, unknown>>,
): void {
  scope.onmessage = async (event: MessageEvent) => {
    const req = event.data as RpcRequest<string, never>;
    if (req?.kind !== "request") return;
    const handler = handlers[req.method];
    const respond = (msg: RpcResponse<unknown>, transfer?: Transferable[]) =>
      scope.postMessage(msg, { transfer: transfer ?? [] });

    if (!handler) {
      respond({ kind: "response", id: req.id, ok: false, error: `unknown method ${req.method}` });
      return;
    }
    try {
      const { result, transfer } = await handler(req.payload, (stage) =>
        respond({ kind: "progress", id: req.id, stage }),
      );
      respond({ kind: "response", id: req.id, ok: true, result }, transfer);
    } catch (e) {
      respond({
        kind: "response",
        id: req.id,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };
}
