/**
 * The app's own record of where the user has been in this tab, so "Back" can
 * tell a real in-app step back from a cold open (docs/planning/pwa-plan.md §4.2).
 *
 * `history.length` cannot do this: it counts pages from before the app opened,
 * and in an installed window `router.back()` with nothing behind it does
 * nothing at all. Pure stack logic here; `recordNavigation` persists it in
 * sessionStorage (per tab, gone when the window closes). Paths only, never a
 * query string, so nothing a page put in its URL is kept.
 */

const STORAGE_KEY = 'equitywise.nav-stack';
const MAX_DEPTH = 50;

/**
 * The stack after arriving at `pathname`. Arriving at the entry just below the
 * top is read as a step back (pop); arriving anywhere else is a step forward.
 */
export function nextStack(stack: readonly string[], pathname: string): readonly string[] {
  if (stack.at(-1) === pathname) return stack;
  if (stack.at(-2) === pathname) return stack.slice(0, -1);
  return [...stack, pathname].slice(-MAX_DEPTH);
}

function read(): readonly string[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function recordNavigation(pathname: string): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextStack(read(), pathname)));
  } catch {
    // Storage blocked: Back falls back to the parent page, which is still correct.
  }
}

/** True when there is an in-app page to go back to. */
export function canGoBackInApp(): boolean {
  return read().length > 1;
}
