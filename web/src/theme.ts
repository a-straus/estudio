// Global light/dark theme: data-theme on <html>, persisted to localStorage.
// One mechanism for the whole app; the SiteFooter toggle drives it.

export type Theme = "light" | "dark";

const STORAGE_KEY = "estudio-theme";

/** The persisted theme, defaulting to light when unset or unreadable. */
export function readTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Reflect the theme on the document root so the token sheet switches. */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
}

/** Persist the theme; failures (private mode) are non-fatal. */
export function persistTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage unavailable — the in-memory theme still applies this session.
  }
}
