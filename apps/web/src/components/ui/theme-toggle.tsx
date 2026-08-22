'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  applyTheme,
  isThemePreference,
  readStoredPreference,
  resolveTheme,
  systemTheme,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  type ThemePreference,
  writeStoredPreference,
} from '@/lib/theme';

const LABELS: Record<ThemePreference, string> = {
  light: 'Light',
  system: 'System',
  dark: 'Dark',
};

/**
 * Inline SVG rather than an icon package: three glyphs do not justify a
 * dependency, and these inherit `currentColor` so the active/inactive states
 * need no per-icon styling.
 */
function ThemeIcon({ preference }: { preference: ThemePreference }) {
  const common = {
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'size-3.5',
  };

  if (preference === 'light') {
    return (
      <svg {...common} aria-hidden>
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.95 3.05l-1.06 1.06M4.11 11.89l-1.06 1.06M12.95 12.95l-1.06-1.06M4.11 4.11L3.05 3.05" />
      </svg>
    );
  }

  if (preference === 'dark') {
    return (
      <svg {...common} aria-hidden>
        <path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1Z" />
      </svg>
    );
  }

  return (
    <svg {...common} aria-hidden>
      <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" />
      <path d="M5.5 14h5" />
    </svg>
  );
}

/**
 * Light / System / Dark switch.
 *
 * The rendered markup cannot depend on `localStorage` during SSR, so no segment
 * is marked active until after mount — otherwise the server's guess and the
 * client's reality disagree and React throws a hydration error. The class on
 * <html> is already correct by then, set by the blocking script in the layout,
 * so nothing visibly flashes.
 */
export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setPreference(readStoredPreference());
    setMounted(true);
  }, []);

  // On `system`, the OS can change under us — at sunset, or when another app
  // flips appearance — and the page must follow without a reload.
  useEffect(() => {
    if (preference !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(systemTheme());
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [preference]);

  // A second tab is the same single user; a theme change there applies here.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const next = isThemePreference(event.newValue) ? event.newValue : 'system';
      setPreference(next);
      applyTheme(resolveTheme(next));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const select = useCallback((next: ThemePreference) => {
    setPreference(next);
    writeStoredPreference(next);
    applyTheme(resolveTheme(next));
  }, []);

  return (
    <fieldset className="flex items-center gap-0.5 rounded-full border border-slate-200 p-0.5 dark:border-slate-800">
      <legend className="sr-only">Colour theme</legend>
      {THEME_PREFERENCES.map((option) => {
        const active = mounted && preference === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => select(option)}
            aria-pressed={active}
            title={`${LABELS[option]} theme`}
            className={`grid size-6 place-items-center rounded-full transition-colors ${
              active
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
            }`}
          >
            <ThemeIcon preference={option} />
            <span className="sr-only">{LABELS[option]}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
