import { EVENT_CATEGORIES } from '@equitywise/db';
import Link from 'next/link';
import { EmptyState } from '@/components/data-display/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EventLogPageDto } from '@/lib/event-log-types';
import type { EventLogQuery } from '@/server/event-log';

/**
 * The event-log viewer: a GET form, a table, an "older" link. Server-rendered with
 * no client state, so a filtered view is a plain URL an admin can share. Read-only.
 */

const IST = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const SELECT_CLASS =
  'flex h-8 w-full min-w-0 rounded-md border border-input bg-surface px-2 text-sm shadow-subtle outline-none focus-visible:border-ring';

function hrefFor(query: EventLogQuery, beforeId: number | null): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === 'beforeId' || value === undefined) continue;
    params.set(key, String(value));
  }
  if (beforeId !== null) params.set('beforeId', String(beforeId));
  const text = params.toString();
  return text === '' ? '/admin/logs' : `/admin/logs?${text}`;
}

const categoryTone = (category: string): 'secondary' | 'outline' =>
  category === 'worker' || category === 'provider' ? 'secondary' : 'outline';

export function EventLogView({ data, query }: { data: EventLogPageDto; query: EventLogQuery }) {
  const filtered = Object.entries(query).some(
    ([key, value]) => key !== 'beforeId' && value !== undefined,
  );

  return (
    <div className="flex flex-col gap-4">
      <form
        method="get"
        action="/admin/logs"
        className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-subtle sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]"
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="log-category">Category</Label>
          <select
            id="log-category"
            name="category"
            defaultValue={query.category ?? ''}
            className={SELECT_CLASS}
          >
            <option value="">All</option>
            {EVENT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="log-event">Event</Label>
          <select
            id="log-event"
            name="event"
            defaultValue={query.event ?? ''}
            className={SELECT_CLASS}
          >
            <option value="">All</option>
            {data.eventNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="log-user">User id</Label>
          <Input
            id="log-user"
            name="userId"
            inputMode="numeric"
            defaultValue={query.userId ?? ''}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="log-from">From (UTC)</Label>
          <Input id="log-from" name="from" type="date" defaultValue={query.from ?? ''} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="log-to">To (UTC)</Label>
          <Input id="log-to" name="to" type="date" defaultValue={query.to ?? ''} />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit" size="sm">
            Filter
          </Button>
          {filtered && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/logs">Clear</Link>
            </Button>
          )}
        </div>
      </form>

      {data.entries.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface shadow-subtle">
          <EmptyState
            title={filtered ? 'No events match these filters' : 'Nothing has been logged yet'}
            description={
              filtered
                ? 'Clear a filter to widen the view.'
                : 'Account actions, worker job failures and credential changes appear here.'
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-subtle">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Time (IST)</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry) => (
                <tr key={entry.id} className="border-b border-border align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                    {IST.format(new Date(entry.at))}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={categoryTone(entry.category)} size="sm">
                      {entry.category}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 font-medium">{entry.event}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                    {entry.userId ?? (
                      <span className="text-muted-foreground">{entry.actorType}</span>
                    )}
                    {entry.ipAddress !== null && (
                      <span className="block text-xs text-subtle-foreground">
                        {entry.ipAddress}
                      </span>
                    )}
                  </td>
                  <td className="max-w-[28rem] px-3 py-2">
                    {entry.detail === null || entry.detail === undefined ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <code className="block break-words text-xs text-muted-foreground">
                        {JSON.stringify(entry.detail)}
                      </code>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.nextBeforeId !== null && (
        <div>
          <Button asChild variant="outline" size="sm">
            <Link href={hrefFor(query, data.nextBeforeId) as never}>Older events</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
