'use client';

import { formatPaise } from '@equitywise/shared';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EditEntryBody, PortfolioEntryDto } from '@/lib/portfolio-types';
import { KIND_LABEL, longDate, request } from './portfolio-client';
import { paiseToPlain, parseRupeesInput } from './portfolio-format';

/**
 * Correct an entry's date, shares and total amount. The stock and the kind stay as
 * they were; to change those, delete the entry and add a new one.
 */
export function EditEntryDialog({
  entry,
  onClose,
  onSaved,
}: {
  entry: PortfolioEntryDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [shares, setShares] = React.useState('');
  const [total, setTotal] = React.useState('');
  const [date, setDate] = React.useState('');
  const [acquiredOnText, setAcquiredOnText] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (entry === null) return;
    setShares(String(entry.shares));
    setTotal(paiseToPlain(entry.amountPaise));
    setDate(entry.tradeDate);
    setAcquiredOnText(entry.acquiredOn ?? '');
    setError(null);
  }, [entry]);

  const save = async () => {
    if (entry === null) return;
    const n = Number(shares.replace(/,/g, ''));
    if (!Number.isInteger(n) || n < 1)
      return setError('Enter the number of shares as a whole number.');
    const totalPaise = parseRupeesInput(total);
    if (totalPaise === null) return setError('Enter the total in rupees, for example 12450.50.');
    setBusy(true);
    setError(null);
    if (entry.kind === 'opening' && acquiredOnText !== '' && acquiredOnText > date)
      return setError('The purchase date cannot be after the date the numbers are true on.');
    const body: EditEntryBody = {
      tradeDate: date,
      shares: n,
      totalPaise,
      ...(entry.kind === 'opening'
        ? { acquiredOn: acquiredOnText === '' ? null : acquiredOnText }
        : {}),
    };
    const result = await request(`/api/portfolio/entries/${entry.id}`, 'PATCH', body);
    setBusy(false);
    if (!result.ok) return setError(result.message);
    onSaved();
    onClose();
  };

  const label =
    entry?.kind === 'remove'
      ? 'Total you received (₹, after charges)'
      : entry?.kind === 'opening'
        ? 'Total cost of these shares (₹)'
        : 'Total you paid (₹, with charges)';

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Edit {entry?.symbol} · {entry === null ? '' : KIND_LABEL[entry.kind]}
          </DialogTitle>
          <DialogDescription>
            Change the numbers you entered. To change the stock or the kind of entry, delete it and
            add a new one.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-edit-shares">Number of shares</Label>
              <Input
                id="pf-edit-shares"
                inputMode="numeric"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-edit-date">Date</Label>
              <Input
                id="pf-edit-date"
                type="date"
                max={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pf-edit-total">{label}</Label>
            <Input
              id="pf-edit-total"
              inputMode="decimal"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </div>
          {entry?.kind === 'opening' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-edit-acquired-on">Acquired on (optional)</Label>
              <Input
                id="pf-edit-acquired-on"
                type="date"
                max={date === '' ? today : date}
                value={acquiredOnText}
                onChange={(e) => setAcquiredOnText(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">
                Used for how long you have held them. Leave empty if you do not know.
              </span>
            </div>
          )}
          {error !== null && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A list of entries with edit and delete on each row. Reports a failure through `onError`. */
export function EntryRows({
  entries,
  onChanged,
  onError,
  className,
}: {
  entries: readonly PortfolioEntryDto[];
  onChanged: () => void;
  onError: (message: string | null) => void;
  className?: string;
}) {
  const [editing, setEditing] = React.useState<PortfolioEntryDto | null>(null);
  const [busy, setBusy] = React.useState(false);

  const remove = async (id: number) => {
    setBusy(true);
    onError(null);
    const result = await request(`/api/portfolio/entries/${id}`, 'DELETE');
    setBusy(false);
    if (!result.ok) return onError(result.message);
    onChanged();
  };

  return (
    <>
      <ul
        className={
          className ??
          'divide-y divide-border overflow-auto rounded-md border border-border text-sm'
        }
      >
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <div className="font-medium">
                {entry.symbol}{' '}
                <span className="font-normal text-muted-foreground">
                  · {KIND_LABEL[entry.kind]}
                </span>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {longDate(entry.tradeDate)} · {entry.shares} shares ·{' '}
                {formatPaise(entry.amountPaise)}
                {entry.acquiredOn === null ? '' : ` · acquired ${longDate(entry.acquiredOn)}`}
                {entry.source === 'file' ? ' · from a file' : ''}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                size="icon"
                variant="ghost"
                disabled={busy}
                aria-label={`Edit ${entry.symbol} entry from ${longDate(entry.tradeDate)}`}
                onClick={() => setEditing(entry)}
              >
                <PencilIcon />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                disabled={busy}
                aria-label={`Delete ${entry.symbol} entry from ${longDate(entry.tradeDate)}`}
                onClick={() => void remove(entry.id)}
              >
                <Trash2Icon />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <EditEntryDialog entry={editing} onClose={() => setEditing(null)} onSaved={onChanged} />
    </>
  );
}
