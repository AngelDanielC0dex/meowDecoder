/**
 * Branded ID types: prevents passing a CatId where a SessionId is expected.
 * Zero runtime cost.
 */
declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type CatId = Brand<string, "CatId">;
export type SessionId = Brand<string, "SessionId">;
export type FeedbackId = Brand<string, "FeedbackId">;

/** UUID v4 via Web Crypto (available in all target runtimes, incl. workers). */
const uuid = (): string => globalThis.crypto.randomUUID();

export const newCatId = (): CatId => uuid() as CatId;
export const newSessionId = (): SessionId => uuid() as SessionId;
export const newFeedbackId = (): FeedbackId => uuid() as FeedbackId;
