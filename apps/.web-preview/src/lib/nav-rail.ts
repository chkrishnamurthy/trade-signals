/**
 * The navigation rail's open/closed state.
 *
 * Shaped like the theme preference in `theme.ts`, and for the same reason: the
 * server cannot read localStorage, so a blocking script writes the restored
 * state onto <html> before the first paint and the stylesheet decides what it
 * looks like.
 *
 * The consequence worth stating, because it constrains the components: React
 * renders the SAME tree in both states. Labels are always in the DOM and CSS
 * is what hides them. Deriving the markup from the state instead would mean
 * either a hydration mismatch or a post-mount effect — and a post-mount effect
 * is what produces the width jump a user sees on every single page load.
 */

/** Kept as `1`/`0` under the original key so an existing preference survives. */
export const NAV_STORAGE_KEY = 'signal.nav.collapsed';

export type NavState = 'expanded' | 'collapsed';

/** What the shortcut is called wherever it is written down for the user. */
export const NAV_SHORTCUT_HINT = 'Ctrl / ⌘ B';

export function readStoredNavState(): NavState {
  try {
    return window.localStorage.getItem(NAV_STORAGE_KEY) === '1' ? 'collapsed' : 'expanded';
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). Expanded is
    // the safe default — the labels are the discoverable state.
    return 'expanded';
  }
}

export function writeStoredNavState(state: NavState): void {
  try {
    window.localStorage.setItem(NAV_STORAGE_KEY, state === 'collapsed' ? '1' : '0');
  } catch {
    // The preference simply does not persist; the session still works.
  }
}

/** The state currently painted, which before hydration only the DOM knows. */
export function currentNavState(): NavState {
  return document.documentElement.dataset.nav === 'collapsed' ? 'collapsed' : 'expanded';
}

export function applyNavState(state: NavState): void {
  document.documentElement.dataset.nav = state;
}

/**
 * Runs blocking, in <head>, before React exists. Deliberately tiny and
 * exception-swallowing: a throw here would leave the page unstyled.
 */
export const NAV_INIT_SCRIPT = `(function(){try{document.documentElement.setAttribute("data-nav",localStorage.getItem(${JSON.stringify(
  NAV_STORAGE_KEY,
)})==="1"?"collapsed":"expanded");}catch(e){}})();`;
