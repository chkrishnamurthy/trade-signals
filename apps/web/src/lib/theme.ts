import { PWA_COLORS } from './pwa';

/**
 * Theme preference: what the user asked for, which is not the same as what is
 * rendered. `system` defers to the OS, so it resolves to light or dark at read
 * time and can change without the user touching anything.
 */
export type ThemePreference = 'light' | 'dark' | 'system';

/** What actually gets painted once `system` has been resolved. */
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'signal.theme';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'system', 'dark'];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** The OS preference. Falls back to light where `matchMedia` is unavailable. */
export function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? systemTheme() : preference;
}

/**
 * Reads the stored preference. Storage can throw outright (Safari private
 * browsing, site-data blocked), and a corrupted value must not brick the page,
 * so anything unrecognised degrades to `system`.
 */
export function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function writeStoredPreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // A theme that does not survive a reload beats a click that throws.
  }
}

/** The browser/status-bar colour for each resolved theme (the theme's `--surface`). */
export const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: PWA_COLORS.lightSurface,
  dark: PWA_COLORS.darkSurface,
};

/**
 * Single place that owns the class `globals.css` keys the `dark:` variant off,
 * and the `theme-color` meta, so an installed app's title bar follows the theme
 * the user picked rather than only the OS setting.
 */
export function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta !== null) meta.setAttribute('content', THEME_COLOR[resolved]);
}

/**
 * Runs blocking in <head>, before first paint, so a dark-mode user never gets a
 * white flash while React hydrates. Kept in sync with the functions above by
 * hand — it cannot import them, because it executes before any bundle loads.
 *
 * It also sets `data-display-mode` ("standalone" when running as an installed
 * app, else "browser") so CSS can key installed-only rules off it with no
 * layout shift, and points the `theme-color` meta at the resolved theme.
 */
export const THEME_INIT_SCRIPT = `(function(){var h=document.documentElement;try{var sa=window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;h.setAttribute("data-display-mode",sa?"standalone":"browser");}catch(e){}try{var s=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var d=s==="dark"||((s===null||s==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);h.classList.toggle("dark",d);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",d?${JSON.stringify(
  THEME_COLOR.dark,
)}:${JSON.stringify(THEME_COLOR.light)});}catch(e){}})();`;
