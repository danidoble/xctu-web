// useTheme.ts — three-state theme (light / dark / system), persisted in localStorage.
// Applies data-theme="dark" / "light" on <html>. "system" follows prefers-color-scheme.

import { useEffect, useState, useCallback } from "react";

export type ThemeMode = "light" | "dark" | "system";
const STORAGE_KEY = "xctu-theme";

function systemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(mode: ThemeMode) {
  const resolved = mode === "system" ? systemTheme() : mode;
  document.documentElement.setAttribute("data-theme", resolved);
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "system";
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    return stored ?? "system";
  });

  useEffect(() => {
    apply(mode);
    window.localStorage.setItem(STORAGE_KEY, mode);

    // For 'system' mode, react to OS theme changes live.
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => apply("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  const cycle = useCallback(() => {
    setMode((m) => (m === "light" ? "dark" : m === "dark" ? "system" : "light"));
  }, []);

  const resolved = mode === "system" ? systemTheme() : mode;
  return { mode, resolved, setMode, cycle };
}
