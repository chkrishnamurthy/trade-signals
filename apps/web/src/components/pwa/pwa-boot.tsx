'use client';

import { useEffect } from 'react';
import { useToast } from '@/components/ui/toast';
import { applyTheme, readStoredPreference, resolveTheme } from '@/lib/theme';
import { startInstallCapture } from '@/lib/use-install-prompt';

/**
 * Page-wide PWA wiring, mounted once in the root layout (renders nothing).
 *
 * - Captures the install prompt as early as possible.
 * - Re-applies the theme so the `theme-color` meta matches the in-app theme
 *   (the meta can arrive after THEME_INIT_SCRIPT ran).
 * - Registers `/sw.js` in production only. In development it removes any
 *   worker left behind, so hot reload is never intercepted.
 * - When a new version is waiting, asks before switching (docs/planning/pwa-plan.md §5.2):
 *   swapping the worker under an open page could mix old and new code.
 */
export function PwaBoot() {
  const { toast } = useToast();

  useEffect(() => {
    startInstallCapture();
    applyTheme(resolveTheme(readStoredPreference()));
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
        .catch(() => undefined);
      return;
    }

    let cancelled = false;
    let registration: ServiceWorkerRegistration | null = null;
    let offered = false;
    let reloading = false;

    const offerUpdate = (worker: ServiceWorker) => {
      if (offered || cancelled) return;
      offered = true;
      toast({
        title: 'A new version of EquityWise is ready',
        description: 'Reload to use it. Anything you have not saved on this page will be lost.',
        duration: 0,
        action: {
          label: 'Reload',
          onClick: () => worker.postMessage({ type: 'SKIP_WAITING' }),
        },
      });
    };

    const watch = (reg: ServiceWorkerRegistration) => {
      // Only an update needs asking about; the very first install has nothing to replace.
      if (reg.waiting !== null && navigator.serviceWorker.controller !== null) {
        offerUpdate(reg.waiting);
      }
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (installing === null) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller !== null) {
            offerUpdate(installing);
          }
        });
      });
    };

    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    const checkForUpdate = () => {
      if (document.visibilityState === 'visible')
        void registration?.update().catch(() => undefined);
    };

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((reg) => {
          if (cancelled) return;
          registration = reg;
          watch(reg);
        })
        .catch(() => undefined);
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', checkForUpdate);
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', checkForUpdate);
      window.removeEventListener('load', register);
    };
  }, [toast]);

  return null;
}
