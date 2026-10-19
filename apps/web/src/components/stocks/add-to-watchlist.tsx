'use client';

import { ListPlusIcon } from 'lucide-react';
import { useState } from 'react';
import { SkeletonRows } from '@/components/data-display/loading';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
    <Popover onOpenChange={(open) => open && void load()}>
      <PopoverTrigger asChild>
        <Button>
          <ListPlusIcon aria-hidden />
          Add to watchlist
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-1.5">
        {status !== null && <p className="px-2 py-1.5 text-muted-foreground text-xs">{status}</p>}
        {failed ? (
          <div className="p-2 text-xs" role="alert">
            Could not load watchlists.{' '}
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : lists === null ? (
          <SkeletonRows rows={3} label="Loading watchlists" />
        ) : lists.length === 0 ? (
          <p className="px-2 py-3 text-muted-foreground text-xs">Create a watchlist first.</p>
        ) : (
          lists.map((w) => (
            <button
              key={w.id}
              type="button"
              className="w-full cursor-pointer truncate rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
              onClick={async () => {
                const r = await fetch(`${API_ROUTES.watchlist(w.id)}/items`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ symbols: [symbol] }),
                });
                setStatus(r.ok ? `Added to ${w.name}.` : 'Could not add it.');
              }}
            >
              {w.name}
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}
