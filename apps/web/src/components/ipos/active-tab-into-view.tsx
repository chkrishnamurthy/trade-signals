'use client';

import { useEffect } from 'react';

/**
 * On a phone the section tabs scroll sideways and the active one can start
 * out of sight (Pipeline, Grey market). This brings it into view once, without
 * moving the page itself.
 */
export function ActiveTabIntoView({ navId }: { navId: string }) {
  useEffect(() => {
    const nav = document.getElementById(navId);
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav === null || nav === undefined || active === null || active === undefined) return;
    if (nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }, [navId]);
  return null;
}
