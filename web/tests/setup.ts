import "@testing-library/jest-dom/vitest";

// crypto.randomUUID is used by domain ID factories; jsdom may lack it.
if (!globalThis.crypto?.randomUUID) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).crypto = {
    ...globalThis.crypto,
    randomUUID: () =>
      "00000000-0000-4000-8000-" + Math.random().toString(16).slice(2, 14).padEnd(12, "0"),
  };
}
