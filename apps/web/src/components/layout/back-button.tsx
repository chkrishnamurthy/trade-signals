'use client';

import { ChevronLeftIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { canGoBackInApp } from '@/lib/in-app-history';
import type { ParentRoute } from '@/lib/navigation';
import { cn } from '@/lib/utils';

/**
 * "Back", in the top bar's brand slot on pages below the tab level
 * (docs/planning/pwa-plan.md §4.2).
 *
 * An installed iOS app has no back button of its own, and a phone user deep in
 * a long stock page should not scroll up to find one — so it lives in the
 * sticky bar, like a native navigation bar.
 *
 * With in-app history it steps back to the real previous page. Without any
 * (opened from a shortcut, notification or shared link) it replaces the page
 * with its parent, so back never closes the app or does nothing. The label is
 * "Back", not the parent's name, because the previous page is not always the
 * parent.
 */
export function BackButton({
  parent,
  className,
}: {
  parent: ParentRoute;
  className?: string | undefined;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      data-nav-back
      onClick={() => {
        if (canGoBackInApp()) router.back();
        else router.replace(parent.href);
      }}
      className={cn(
        '-ml-2 min-h-11 shrink-0 items-center gap-0.5 rounded-md pr-2.5 pl-1 font-medium text-foreground text-sm transition-colors hover:bg-accent/60',
        'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring',
        className,
      )}
    >
      <ChevronLeftIcon className="size-5 text-primary-strong" aria-hidden />
      Back
    </button>
  );
}
