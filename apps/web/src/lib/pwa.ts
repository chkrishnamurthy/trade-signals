/**
 * Progressive Web App constants and helpers (docs/planning/pwa-plan.md).
 *
 * Colours are hex because a web app manifest and `<meta name="theme-color">`
 * cannot read CSS custom properties. `pwa.test.ts` converts the OKLCH tokens in
 * `globals.css` and fails if these drift from them.
 */

export const PWA_COLORS = {
  /** `--background`, light — the manifest splash background. */
  lightBackground: '#edf0f3',
  /** `--surface`, light — the title/status bar in the light theme. */
  lightSurface: '#ffffff',
  /** `--background`, dark. */
  darkBackground: '#05070c',
  /** `--surface`, dark — the title/status bar in the dark theme. */
  darkSurface: '#171c22',
} as const;

/** Where an installed app opens. `source=pwa` marks installed launches in access logs; it carries nothing personal. */
export const PWA_START_URL = '/today?source=pwa';

/** The `data-display-mode` attribute on `<html>`, set before first paint by `THEME_INIT_SCRIPT`. */
export type DisplayMode = 'standalone' | 'browser';

/**
 * True when the page runs as an installed app (its own window, no browser
 * chrome). Reads the attribute the init script set, falling back to the media
 * query for code that runs before it.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const attribute = document.documentElement.dataset.displayMode;
  if (attribute === 'standalone') return true;
  if (attribute === 'browser') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone / iPad Safari, where installing is a manual "Add to Home Screen". */
export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  // iPadOS 13+ reports itself as a Mac; a touch screen gives it away.
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

/**
 * iPhone launch screens: one image per device class and theme, matched by media
 * query. Sizes are device pixels in portrait; `generate-pwa-assets.mjs` writes
 * the files and must list the same sizes.
 */
const IOS_SPLASH_SIZES: ReadonlyArray<readonly [width: number, height: number, ratio: number]> = [
  [1320, 2868, 3],
  [1206, 2622, 3],
  [1290, 2796, 3],
  [1179, 2556, 3],
  [1284, 2778, 3],
  [1170, 2532, 3],
  [1125, 2436, 3],
  [1242, 2688, 3],
  [828, 1792, 2],
  [1242, 2208, 3],
  [750, 1334, 2],
];

export const IOS_SPLASH_SCREENS: ReadonlyArray<{ readonly url: string; readonly media: string }> =
  IOS_SPLASH_SIZES.flatMap(([width, height, ratio]) =>
    (['light', 'dark'] as const).map((theme) => ({
      url: `/splash/${theme}-${width}x${height}.png`,
      media: `(device-width: ${width / ratio}px) and (device-height: ${height / ratio}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait) and (prefers-color-scheme: ${theme})`,
    })),
  );

/** The install banner shows from the first signed-in visit, once the browser says the app can be installed. */
export const INSTALL_MIN_VISITS = 1;
/** "Not now" quiets the banner for this long. */
export const INSTALL_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

/** Window event that opens the install flow from elsewhere (the account menu). */
export const INSTALL_HELP_EVENT = 'equitywise:install-help';

export interface InstallOfferInput {
  readonly standalone: boolean;
  readonly installed: boolean;
  /** The browser can install: a captured prompt (Chromium) or iOS "Add to Home Screen". */
  readonly installable: boolean;
  readonly visits: number;
  /** Epoch ms of the last "Not now", or null. */
  readonly dismissedAt: number | null;
  readonly now: number;
}

/** Whether to show the install banner (docs/planning/pwa-plan.md §5.1). Pure, for testing. */
export function shouldOfferInstall(input: InstallOfferInput): boolean {
  if (input.standalone || input.installed || !input.installable) return false;
  if (input.visits < INSTALL_MIN_VISITS) return false;
  return input.dismissedAt === null || input.now - input.dismissedAt >= INSTALL_SNOOZE_MS;
}
