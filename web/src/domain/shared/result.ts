/**
 * Explicit success/failure without exceptions for expected error paths.
 * Exceptions remain for programmer errors only.
 */
export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export interface AppError {
  /** Stable machine-readable code; UI maps it to localized messages. */
  readonly code: string;
  /** Developer-facing detail. Never shown raw to users. */
  readonly message: string;
  readonly cause?: unknown;
}

export const appError = (code: string, message: string, cause?: unknown): AppError => ({
  code,
  message,
  ...(cause !== undefined ? { cause } : {}),
});
