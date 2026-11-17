'use client';

import { ListPlusIcon } from 'lucide-react';
import { useState } from 'react';
import { SkeletonRows } from '@/components/data-display/loading';
import {
  AdaptivePopover,
  PanelBody,
  PanelHeader,
  PanelItem,
  PanelMessage,
} from '@/components/ui/adaptive-popover';
import { Button } from '@/components/ui/button';
import { API_ROUTES } from '@/lib/api-routes';

/** Adds the stock to one of the viewer's watchlists, chosen from a popover. */
export function AddToWatchlist({ symbol }: { symbol: string }) {
  const [lists, setLists] = useState<readonly { id: number; name: string }[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const load = async () => {
    if (lists !== null) return;
    setFailed(false);
    try {
      const r = await fetch(API_ROUTES.watchlists);
      if (!r.ok) throw new Error('Watchlists unavailable');
      const body = (await r.json().catch(() => [])) as unknown;
      const rows = Array.isArray(body)
        ? body
        : ((body as { watchlists?: unknown[] }).watchlists ?? []);
      setLists(
        rows.flatMap((w) =>
          typeof w === 'object' && w !== null && 'id' in w && 'name' in w
            ? [{ id: Number(w.id), name: String(w.name) }]
            : [],
        ),
      );
    } catch {
      setFailed(true);
    }
  };
  return (
    <AdaptivePopover
      title="Add to watchlist"
      className="w-64"
      onOpenChange={(open) => {
        if (open) void load();
      }}
      trigger={
        <Button>
          <ListPlusIcon aria-hidden />
          Add to watchlist
        </Button>
      }
    >
      <PanelHeader title={`Add ${symbol} to a watchlist`} />
      <PanelBody className="py-1.5">
        {status !== null && (
          <p role="status" className="m-0 px-4 py-1.5 text-muted-foreground text-xs">
            {status}
          </p>
        )}
        {failed ? (
          <div className="flex items-center gap-1 px-4 py-2 text-sm" role="alert">
            Could not load watchlists.
            <Button variant="link" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : lists === null ? (
          <SkeletonRows rows={3} label="Loading watchlists" className="px-4" />
        ) : lists.length === 0 ? (
          <PanelMessage>Create a watchlist first.</PanelMessage>
        ) : (
          lists.map((w) => (
            <PanelItem
              key={w.id}
              onClick={async () => {
                const r = await fetch(`${API_ROUTES.watchlist(w.id)}/items`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ symbols: [symbol] }),
                });
                setStatus(r.ok ? `Added to ${w.name}.` : 'Could not add it.');
              }}
            >
              <span className="truncate">{w.name}</span>
            </PanelItem>
          ))
        )}
      </PanelBody>
    </AdaptivePopover>
  );
}
