import "@testing-library/jest-dom/vitest";

// jsdom has no matchMedia; components that read the color-scheme preference
// (ThemeProvider) need it. Default to "light" (matches: false).
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// crypto.randomUUID is used by domain ID factories; jsdom may lack it.
if (!globalThis.crypto?.randomUUID) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).crypto = {
    ...globalThis.crypto,
    randomUUID: () =>
      "00000000-0000-4000-8000-" + Math.random().toString(16).slice(2, 14).padEnd(12, "0"),
  };
}
