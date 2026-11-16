'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { isStandalone } from './pwa';

/**
 * Small browser-state hooks for the installed-app behaviours
 * (docs/planning/pwa-plan.md §4–5). Each renders the "nothing special" value on
 * the server and on the first client frame, so markup never mismatches.
 */

/** Elements that raise a phone's on-screen keyboard. */
const NON_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

export function isTextEntry(element: Element | null): boolean {
  if (element === null) return false;
  if (element instanceof HTMLTextAreaElement) return !element.readOnly;
  if (element instanceof HTMLInputElement) {
    return !element.readOnly && !NON_TEXT_INPUTS.has(element.type);
  }
  return element instanceof HTMLElement && element.isContentEditable;
}

/**
 * True while a text field has focus on a touch device — when the on-screen
 * keyboard is up. Used to hide the fixed tab bar so it never rides on top of
 * the keyboard over search results and form fields.
 */
export function useSoftKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)');
    const update = () => setOpen(coarse.matches && isTextEntry(document.activeElement));
    // focusout fires before focus lands on the next element; read it after.
    const onFocusOut = () => window.setTimeout(update, 0);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);
  return open;
}

function subscribeOnline(listener: () => void): () => void {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

/** `navigator.onLine`, live. Assumed online on the server. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** Whether the page runs as an installed app. False until mounted. */
export function useStandalone(): boolean {
  const [standalone, setStandalone] = useState(false);
  useEffect(() => setStandalone(isStandalone()), []);
  return standalone;
}
