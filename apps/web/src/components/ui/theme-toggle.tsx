'use client';

import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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

const ICONS: Record<ThemePreference, typeof SunIcon> = {
  light: SunIcon,
  system: MonitorIcon,
  dark: MoonIcon,
};

/**
 * The stored theme preference and a setter that persists and applies it.
 *
 * Shared by the toggle below and the account menu's Theme choice, so both stay
 * in step with the OS (on `system`) and with other tabs.
 *
 * The rendered markup cannot depend on `localStorage` during SSR, so
 * `preference` is `null` until after mount — otherwise the server's guess and
 * the client's reality disagree and React throws a hydration error. The class
 * on <html> is already correct by then, set by the blocking script in the
 * layout, so nothing visibly flashes.
 */
export function useThemePreference(): {
  readonly preference: ThemePreference | null;
  readonly setPreference: (next: string) => void;
} {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setPreferenceState(readStoredPreference());
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

  // A second tab is the same user; a theme change there applies here.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const next = isThemePreference(event.newValue) ? event.newValue : 'system';
      setPreferenceState(next);
      applyTheme(resolveTheme(next));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setPreference = useCallback((next: string) => {
    if (!isThemePreference(next)) return;
    setPreferenceState(next);
    writeStoredPreference(next);
    applyTheme(resolveTheme(next));
  }, []);

  return { preference: mounted ? preference : null, setPreference };
}

export const THEME_LABELS = LABELS;
export const THEME_ICONS = ICONS;

/** Light / System / Dark switch. */
export function ThemeToggle() {
  const { preference, setPreference } = useThemePreference();

  return (
    <ToggleGroup
      type="single"
      value={preference ?? ''}
      onValueChange={setPreference}
      aria-label="Colour theme"
    >
      {THEME_PREFERENCES.map((option) => {
        const Icon = ICONS[option];
        return (
          <ToggleGroupItem key={option} value={option} title={`${LABELS[option]} theme`}>
            <Icon aria-hidden />
            <span className="sr-only">{LABELS[option]}</span>
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
