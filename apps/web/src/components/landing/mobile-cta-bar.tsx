'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { SignupCta } from './cta';

/**
 * Phone-only sticky sign-up bar (plan §5): appears once the hero's button has
 * scrolled away, and steps aside whenever another sign-up button or the footer
 * is on screen, so it never covers the footer's links or doubles a button the
 * visitor can already see. Elements marked `data-cta-zone` are those places.
 */
export function MobileCtaBar() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const zones = [...document.querySelectorAll<HTMLElement>('[data-cta-zone]')];
    if (zones.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      setShow(visible.size === 0);
    });
    for (const zone of zones) observer.observe(zone);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      // Hidden from everyone while off screen: an invisible button must not
      // take a Tab stop.
      aria-hidden={!show}
      inert={!show}
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-border border-t bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur transition-transform duration-200 motion-reduce:transition-none lg:hidden',
        show ? 'translate-y-0' : 'pointer-events-none translate-y-full',
      )}
    >
      <SignupCta className="w-full" />
    </div>
  );
}
