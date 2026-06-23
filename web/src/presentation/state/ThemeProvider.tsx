"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * Theme system: the user picks light / dark / system, persisted in localStorage.
 * "system" follows the OS and live-updates with it. The resolved theme is applied
 * as a `.dark` class on <html> (see globals.css `@custom-variant dark`). An inline
 * script in the root layout applies the same class BEFORE paint to avoid a flash
 * of the wrong theme (FOUC); this provider takes over once React hydrates.
 */
export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "meow-theme";

interface ThemeContextValue {
  /** The user's explicit choice (may be "system"). */
  theme: Theme;
  /** What is actually applied right now ("light" | "dark"). */
  resolved: "light" | "dark";
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyDarkClass(resolved: "light" | "dark"): void {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Starts "system" on both server and first client render (no hydration drift);
  // the stored choice is read in an effect right after mount.
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (stored === "light" || stored === "dark" || stored === "system") setThemeState(stored);
  }, []);

  // Resolve + apply the class, and keep following the OS while on "system".
  useEffect(() => {
    const resolve = (): "light" | "dark" =>
      theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme;
    const current = resolve();
    setResolved(current);
    applyDarkClass(current);

    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = systemPrefersDark() ? "dark" : "light";
      setResolved(next);
      applyDarkClass(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      /* private mode / storage disabled — theme still applies for this session */
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}

/**
 * The inline script string applied in <head> before paint. Reads the stored
 * choice (or the OS preference) and sets `.dark` synchronously so the first
 * paint already matches the theme. Kept tiny and dependency-free on purpose.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}';var t=localStorage.getItem(k)||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
