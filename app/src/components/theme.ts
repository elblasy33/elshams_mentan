"use client";
export type Theme = "light" | "dark" | "system";
export const THEME_KEY = "shs_theme";

export function getTheme(): Theme {
  try { return (localStorage.getItem(THEME_KEY) as Theme) || "system"; } catch { return "system"; }
}
export function applyTheme(t: Theme) {
  try { localStorage.setItem(THEME_KEY, t); } catch {}
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  window.dispatchEvent(new Event("shs-theme"));
}
