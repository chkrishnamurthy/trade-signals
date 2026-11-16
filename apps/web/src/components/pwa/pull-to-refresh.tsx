'use client';

import { RefreshCwIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** How far (px, after damping) the page must be pulled before release reloads it. */
const THRESHOLD = 64;
const MAX_PULL = 96;

/**
 * Pull-to-refresh for the four tab roots in an installed app
 * (docs/planning/pwa-plan.md §4.4).
 *
 * An installed window has no reload button, and the app turns off the
 * browser's own overscroll there. Live prices refresh themselves; this is for
 * everything else on the page. Release past the threshold reloads the page —
 * the same thing the browser's own gesture does.
 *
 * Only starts when the page is scrolled to the very top and the finger moves
 * mostly downward, so it never fights a table that scrolls sideways.
 */
export function PullToRefresh({ enabled }: { enabled: boolean }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let start: { x: number; y: number } | null = null;

    const set = (value: number) => {
      pullRef.current = value;
      setPull(value);
    };
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      start =
        window.scrollY <= 0 && event.touches.length === 1 && touch !== undefined
          ? { x: touch.clientX, y: touch.clientY }
          : null;
    };
    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (start === null || touch === undefined) return;
      const dy = touch.clientY - start.y;
      const dx = Math.abs(touch.clientX - start.x);
      if (dy <= 0 || dx * 1.5 > dy || window.scrollY > 0) {
        if (pullRef.current !== 0) set(0);
        if (dx * 1.5 > dy) start = null;
        return;
      }
      set(Math.min(dy * 0.5, MAX_PULL));
    };
    const onEnd = () => {
      if (pullRef.current >= THRESHOLD) {
        setRefreshing(true);
        window.location.reload();
        return;
      }
      start = null;
      set(0);
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled]);

  if (!enabled || (pull === 0 && !refreshing)) return null;
  const progress = refreshing ? 1 : pull / THRESHOLD;
  const ready = progress >= 1;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center"
      style={{
        top: `calc(var(--nav-bar-offset) + var(--nav-strip-height) + ${Math.round(refreshing ? 24 : pull / 2)}px)`,
      }}
    >
      <span
        role="status"
        className="flex size-9 items-center justify-center rounded-full border border-border bg-surface shadow-elevated"
        style={{ opacity: Math.min(1, 0.3 + progress) }}
      >
        <RefreshCwIcon
          aria-hidden
          className={cn(
            'size-4',
            ready ? 'text-primary-strong' : 'text-muted-foreground',
            refreshing && 'motion-safe:animate-spin',
          )}
          style={refreshing ? undefined : { transform: `rotate(${Math.round(progress * 270)}deg)` }}
        />
        <span className="sr-only">
          {refreshing ? 'Refreshing' : ready ? 'Release to refresh' : 'Pull to refresh'}
        </span>
      </span>
    </div>
  );
}
