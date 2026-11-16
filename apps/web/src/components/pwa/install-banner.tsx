'use client';

import { ShareIcon, SquarePlusIcon, XIcon } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { INSTALL_HELP_EVENT, isIosDevice, isStandalone, shouldOfferInstall } from '@/lib/pwa';
import { promptInstall, useInstallPrompt } from '@/lib/use-install-prompt';
import { useSoftKeyboardOpen } from '@/lib/use-pwa-environment';

const STORAGE_KEY = 'equitywise.install';
const SESSION_KEY = 'equitywise.install.counted';

interface Stored {
  readonly visits: number;
  readonly dismissedAt: number | null;
}

function readStored(): Stored {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (typeof parsed === 'object' && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      return {
        visits: typeof record.visits === 'number' ? record.visits : 0,
        dismissedAt: typeof record.dismissedAt === 'number' ? record.dismissedAt : null,
      };
    }
  } catch {
    // Unreadable or blocked storage: treat as a first visit (no banner).
  }
  return { visits: 0, dismissedAt: null };
}

function writeStored(value: Stored): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Blocked storage: the banner simply will not reach its visit threshold.
  }
}

/** Counts one visit per browser session (tab lifetime), not one per page. */
function countVisit(): Stored {
  const stored = readStored();
  try {
    if (window.sessionStorage.getItem(SESSION_KEY) !== null) return stored;
    window.sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    return stored;
  }
  const next = { ...stored, visits: stored.visits + 1 };
  writeStored(next);
  return next;
}

/**
 * The install offer (docs/planning/pwa-plan.md §5.1): a slim, dismissible
 * banner above the phone tab bar (bottom-right on desktop), from the first
 * signed-in visit once the browser allows install, never in an
 * installed window, quiet for 30 days after "Not now".
 *
 * Chromium shows its own install dialog. iOS has none, so "Install" opens a
 * two-step sheet instead (Share → Add to Home Screen). The account menu's
 * "Install app" opens the same flow at any time via INSTALL_HELP_EVENT.
 */
export function InstallBanner() {
  const { canPrompt, installed } = useInstallPrompt();
  const keyboardOpen = useSoftKeyboardOpen();
  const [env, setEnv] = useState<{ ios: boolean; standalone: boolean; stored: Stored } | null>(
    null,
  );
  const [iosHelp, setIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setEnv({
      ios: isIosDevice(navigator.userAgent, navigator.maxTouchPoints),
      standalone: isStandalone(),
      stored: countVisit(),
    });
  }, []);

  useEffect(() => {
    const open = () => {
      if (canPrompt) void promptInstall();
      else setIosHelp(true);
    };
    window.addEventListener(INSTALL_HELP_EVENT, open);
    return () => window.removeEventListener(INSTALL_HELP_EVENT, open);
  }, [canPrompt]);

  const show =
    env !== null &&
    !dismissed &&
    !keyboardOpen &&
    shouldOfferInstall({
      standalone: env.standalone,
      installed,
      installable: canPrompt || env.ios,
      visits: env.stored.visits,
      dismissedAt: env.stored.dismissedAt,
      now: Date.now(),
    });

  const notNow = () => {
    setDismissed(true);
    writeStored({ ...readStored(), dismissedAt: Date.now() });
  };

  const install = () => {
    if (canPrompt) {
      void promptInstall().then((outcome) => {
        if (outcome === 'dismissed') notNow();
      });
    } else {
      setIosHelp(true);
    }
  };

  return (
    <>
      {show && (
        <section
          aria-label="Install EquityWise"
          className="fixed inset-x-3 bottom-[calc(var(--bottom-chrome)+0.5rem)] z-30 mx-auto flex max-w-xl items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2.5 shadow-elevated lg:inset-x-auto lg:right-6 lg:bottom-6 lg:max-w-sm"
        >
          <Image
            src="/icons/icon-192.png"
            alt=""
            width={36}
            height={36}
            className="size-9 shrink-0 rounded-md"
          />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm leading-tight">Install EquityWise</p>
            <p className="text-muted-foreground text-xs leading-snug">
              Opens full screen, like an app.
            </p>
          </div>
          <Button size="sm" onClick={install}>
            Install
          </Button>
          <button
            type="button"
            onClick={notNow}
            aria-label="Not now"
            className="-mr-1 flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
          >
            <XIcon className="size-4" aria-hidden />
          </button>
        </section>
      )}

      <Sheet open={iosHelp} onOpenChange={setIosHelp}>
        <SheetContent side="bottom" className="pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <SheetHeader>
            <SheetTitle>Add EquityWise to your Home Screen</SheetTitle>
            <SheetDescription>
              It then opens full screen, like an app. You sign in once inside it.
            </SheetDescription>
          </SheetHeader>
          <ol className="flex flex-col gap-3 px-4 text-sm">
            <li className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent font-semibold">
                1
              </span>
              <span>
                Tap <ShareIcon className="inline size-4 align-text-bottom" aria-label="Share" />{' '}
                Share in the browser bar.
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent font-semibold">
                2
              </span>
              <span>
                Choose <SquarePlusIcon className="inline size-4 align-text-bottom" aria-hidden />{' '}
                <strong>Add to Home Screen</strong>, then Add.
              </span>
            </li>
          </ol>
        </SheetContent>
      </Sheet>
    </>
  );
}
