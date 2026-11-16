'use client';

import { WifiOffIcon } from 'lucide-react';
import { useOnline } from '@/lib/use-pwa-environment';

/**
 * A thin line under the indices strip while the device is offline
 * (docs/planning/pwa-plan.md §5.4). Prices on screen stay as they were; this
 * says plainly that they are not updating, so nothing reads as live when it
 * is not.
 */
export function OfflineBar() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-warning-line border-b bg-warning-soft px-4 py-1.5 text-warning-strong text-xs"
    >
      <WifiOffIcon className="size-3.5 shrink-0" aria-hidden />
      You're offline. Prices are not updating.
    </div>
  );
}
