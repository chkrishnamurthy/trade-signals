'use client';

import { useSyncExternalStore } from 'react';

/**
 * The browser's install prompt, captured once for the whole page.
 *
 * Chromium fires `beforeinstallprompt` early — often before any component that
 * wants it has mounted — so `PwaBoot` (root layout) calls `startInstallCapture()`
 * and components read the result through `useInstallPrompt()`. Safari has no
 * such event; iOS installs by hand (Share → Add to Home Screen).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallState {
  /** A deferred prompt is held and can be shown. */
  readonly canPrompt: boolean;
  /** `appinstalled` fired in this page's lifetime. */
  readonly installed: boolean;
}

let deferred: BeforeInstallPromptEvent | null = null;
let state: InstallState = { canPrompt: false, installed: false };
const listeners = new Set<() => void>();
let started = false;

function set(next: InstallState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function startInstallCapture(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the browser's mini-infobar away; the app offers install itself.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    set({ ...state, canPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    set({ canPrompt: false, installed: true });
  });
}

/** Shows the browser's install dialog. Resolves to the user's answer, or `unavailable`. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferred;
  if (event === null) return 'unavailable';
  // A deferred prompt can be used once.
  deferred = null;
  set({ ...state, canPrompt: false });
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome;
}

const SERVER_STATE: InstallState = { canPrompt: false, installed: false };

export function useInstallPrompt(): InstallState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => SERVER_STATE,
  );
}
