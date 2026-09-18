'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Pulses the background in the direction of a change to `value`.
 *
 * This is what makes a price visibly LIVE: every tick that moves it flashes
 * green or red for under a second. The first render never flashes — a page
 * full of flashing cells on load says "everything just changed", which is
 * false — and an unchanged value never flashes either. The animation is
 * defined once in `globals.css` (`price-flash-up` / `-down`) and restarts on
 * every change because the class is re-applied with a fresh key.
 *
 * Shared by the watchlist table cells and the index strip so a level and a
 * price move the same way.
 */
export function FlashOnChange({
  value,
  className,
  children,
}: {
  value: number | null;
  className?: string | undefined;
  children: ReactNode;
}) {
  const previous = useRef<number | null>(value);
  const [flash, setFlash] = useState<{ tone: 'up' | 'down'; key: number } | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = value;
    if (before === null || value === null || before === value) return;
    setFlash({ tone: value > before ? 'up' : 'down', key: Date.now() });
  }, [value]);

  return (
    <span
      key={flash?.key}
      className={cn(
        'inline-block rounded-sm px-1 -mx-1',
        flash?.tone === 'up' && 'price-flash-up',
        flash?.tone === 'down' && 'price-flash-down',
        className,
      )}
    >
      {children}
    </span>
  );
}
