'use client';

import { CheckIcon, FileUpIcon, XIcon } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Text } from '@/components/ui/typography';
import { API_ROUTES } from '@/lib/api-routes';
import { type ImportRow, MAX_ROWS, type ParsedImport, parseImport } from '@/lib/import-symbols';
import { cn } from '@/lib/utils';

/**
 * Paste or import a list of stocks.
 *
 * Three steps, on one panel, so the user always sees where they are:
 *
 *   1. paste text or choose a file — parsed IN THE BROWSER (`import-symbols`),
 *      so a holdings export never leaves the machine whole; only the symbol,
 *      ISIN or company name per row goes up;
 *   2. the server says what each row is — matched, ambiguous, unknown, or
 *      already on this list — and the user unticks anything they don't want
 *      and picks between candidates where a name fit several companies;
 *   3. "Add N" sends the chosen symbols through the same add path the search
 *      tab uses. Nothing here writes anything on its own.
 *
 * A row that could not be placed is shown, not hidden: the user should know
 * which line of their file was skipped and why.
 */

type Resolution =
  | {
      readonly status: 'matched';
      readonly symbol: string;
      readonly name: string;
      readonly via: string;
    }
  | {
      readonly status: 'ambiguous';
      readonly candidates: readonly { symbol: string; name: string }[];
    }
  | { readonly status: 'unknown' };

interface PreviewRow {
  readonly input: ImportRow;
  readonly resolution: Resolution;
  /** The symbol this row will add, once the user has settled any ambiguity. */
  readonly symbol: string | null;
  readonly already: boolean;
}

export function ImportStocks({
  existingSymbols,
  onAdd,
}: {
  existingSymbols: readonly string[];
  onAdd: (symbols: readonly string[]) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [preview, setPreview] = useState<readonly PreviewRow[] | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [resolving, setResolving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<readonly string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const existing = useMemo(
    () => new Set(existingSymbols.map((symbol) => symbol.toUpperCase())),
    [existingSymbols],
  );

  const readFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      setText(content);
      setPreview(null);
      setParsed(null);
    };
    reader.readAsText(file);
  }, []);

  const resolve = useCallback(async () => {
    const next = parseImport(text);
    setParsed(next);
    setError(null);
    setAdded([]);
    if (next.rows.length === 0) {
      setPreview([]);
      return;
    }

    setResolving(true);
    try {
      const response = await fetch(API_ROUTES.searchResolve, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: next.rows.map(({ symbol, isin, name }) => ({
            ...(symbol === undefined ? {} : { symbol }),
            ...(isin === undefined ? {} : { isin }),
            ...(name === undefined ? {} : { name }),
          })),
        }),
      });
      const payload = (await response.json()) as
        | { results: readonly Resolution[] }
        | { error: string };
      if (!response.ok || !('results' in payload)) {
        setError('error' in payload ? payload.error : 'Could not look these up.');
        return;
      }

      const seen = new Set<string>();
      const rows: PreviewRow[] = next.rows.map((input, index) => {
        const resolution = payload.results[index] ?? { status: 'unknown' as const };
        const symbol = resolution.status === 'matched' ? resolution.symbol : null;
        // Two input lines that resolve to the same stock add it once.
        const duplicate = symbol !== null && seen.has(symbol);
        if (symbol !== null) seen.add(symbol);
        return {
          input,
          resolution: duplicate ? { status: 'unknown' } : resolution,
          symbol: duplicate ? null : symbol,
          already: symbol !== null && existing.has(symbol),
        };
      });
      setPreview(rows);
      setSelected(
        new Set(
          rows
            .filter((row) => row.symbol !== null && !row.already)
            .map((row) => row.symbol as string),
        ),
      );
    } catch {
      setError('Could not look these up.');
    } finally {
      setResolving(false);
    }
  }, [text, existing]);

  /** Settles an ambiguous row on one of its candidates. */
  const pick = useCallback(
    (index: number, symbol: string, name: string) => {
      setPreview((current) =>
        current === null
          ? current
          : current.map((row, i) =>
              i === index
                ? {
                    ...row,
                    resolution: { status: 'matched', symbol, name, via: 'name' },
                    symbol,
                    already: existing.has(symbol),
                  }
                : row,
            ),
      );
      if (!existing.has(symbol)) setSelected((current) => new Set([...current, symbol]));
    },
    [existing],
  );

  const toggle = useCallback((symbol: string, on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(symbol);
      else next.delete(symbol);
      return next;
    });
  }, []);

  const commit = useCallback(async () => {
    const symbols = [...selected];
    if (symbols.length === 0) return;
    setBusy(true);
    setError(null);
    const result = await onAdd(symbols);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not add these stocks.');
      return;
    }
    setAdded(symbols);
    setPreview(null);
    setParsed(null);
    setText('');
    setSelected(new Set());
  }, [selected, onAdd]);

  const counts = useMemo(() => {
    const rows = preview ?? [];
    return {
      matched: rows.filter((row) => row.symbol !== null && !row.already).length,
      already: rows.filter((row) => row.already).length,
      ambiguous: rows.filter((row) => row.resolution.status === 'ambiguous').length,
      unknown: rows.filter((row) => row.resolution.status === 'unknown').length,
    };
  }, [preview]);

  return (
    <div className="flex flex-col gap-3">
      {preview === null && (
        <>
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              'RELIANCE, TCS, INFY\n— or paste the contents of a holdings export from Zerodha, Groww, Upstox…'
            }
            aria-label="Symbols or CSV to import"
            rows={7}
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.txt,.tsv,text/csv,text/plain"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file !== undefined) readFile(file);
                event.target.value = '';
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              <FileUpIcon />
              Choose a CSV
            </Button>
            <Text variant="caption" className="flex-1">
              Symbols, ISINs or company names, separated any way. The file stays in your browser;
              only the names are looked up. Up to {MAX_ROWS} rows.
            </Text>
            <Button
              size="sm"
              onClick={() => void resolve()}
              disabled={text.trim() === ''}
              loading={resolving}
            >
              Preview
            </Button>
          </div>
          {added.length > 0 && (
            <div className="flex flex-col items-center gap-1 rounded-md border border-border px-2 py-4 text-center">
              <Badge variant="bullish">
                <CheckIcon aria-hidden />
                Added {added.length}
              </Badge>
              <Text variant="caption">{added.join(', ')}</Text>
            </div>
          )}
        </>
      )}

      {preview !== null && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {parsed?.format === 'csv' && parsed.columns !== undefined && (
              <Text variant="caption" className="mr-auto">
                Read as a file, using{' '}
                {[parsed.columns.symbol, parsed.columns.isin, parsed.columns.name]
                  .filter((label) => label !== undefined && label !== '')
                  .map((label) => `“${label}”`)
                  .join(', ')}
                .
              </Text>
            )}
            {parsed?.format === 'list' && (
              <Text variant="caption" className="mr-auto">
                Read as a list of {parsed.rows.length}.
              </Text>
            )}
            {counts.matched > 0 && (
              <Badge variant="bullish" size="sm">
                {counts.matched} found
              </Badge>
            )}
            {counts.already > 0 && (
              <Badge variant="secondary" size="sm">
                {counts.already} already here
              </Badge>
            )}
            {counts.ambiguous > 0 && (
              <Badge variant="warning" size="sm">
                {counts.ambiguous} to choose
              </Badge>
            )}
            {counts.unknown > 0 && (
              <Badge variant="neutral" size="sm">
                {counts.unknown} not found
              </Badge>
            )}
            {(parsed?.truncated ?? 0) > 0 && (
              <Badge variant="warning" size="sm">
                {parsed?.truncated} beyond the limit
              </Badge>
            )}
          </div>

          {preview.length === 0 ? (
            <div className="px-2 py-6 text-center">
              <Text variant="label">Nothing to import</Text>
              <Text variant="caption">No symbol, ISIN or company name was recognised.</Text>
            </div>
          ) : (
            <ScrollArea className="max-h-64 rounded-md border border-border">
              <ul className="divide-y divide-border">
                {preview.map((row, index) => (
                  <PreviewLine
                    key={`${row.input.line}:${row.input.symbol ?? row.input.isin ?? row.input.name ?? ''}`}
                    row={row}
                    checked={row.symbol !== null && selected.has(row.symbol)}
                    onToggle={(on) => row.symbol !== null && toggle(row.symbol, on)}
                    onPick={(symbol, name) => pick(index, symbol, name)}
                  />
                ))}
              </ul>
            </ScrollArea>
          )}

          {error !== null && (
            <Text variant="caption" className="text-destructive">
              {error}
            </Text>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPreview(null);
                setParsed(null);
              }}
            >
              Back
            </Button>
            <Button
              size="sm"
              onClick={() => void commit()}
              disabled={selected.size === 0}
              loading={busy}
            >
              Add {selected.size > 0 ? selected.size : ''}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function PreviewLine({
  row,
  checked,
  onToggle,
  onPick,
}: {
  row: PreviewRow;
  checked: boolean;
  onToggle: (on: boolean) => void;
  onPick: (symbol: string, name: string) => void;
}) {
  const input = row.input.symbol ?? row.input.name ?? row.input.isin ?? '';
  const { resolution } = row;
  const id = `import-${row.input.line}-${input}`;

  return (
    <li className={cn('flex items-start gap-2 px-2 py-1.5', row.already && 'opacity-60')}>
      <div className="w-5 pt-0.5">
        {resolution.status === 'matched' && !row.already && (
          <Checkbox id={id} checked={checked} onCheckedChange={(next) => onToggle(next === true)} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-xs">
          {resolution.status === 'matched' ? (
            <>
              <span className="font-medium">{resolution.symbol}</span>
              <span className="truncate text-2xs text-muted-foreground">{resolution.name}</span>
            </>
          ) : (
            <span className="truncate font-medium text-muted-foreground">{input}</span>
          )}
        </label>
        {resolution.status === 'matched' && input.toUpperCase() !== resolution.symbol && (
          <span className="text-2xs text-subtle-foreground">
            line {row.input.line}: “{input}”
          </span>
        )}
        {resolution.status === 'ambiguous' && (
          <div className="mt-1 flex flex-wrap gap-1">
            {resolution.candidates.map((candidate) => (
              <button
                key={candidate.symbol}
                type="button"
                onClick={() => onPick(candidate.symbol, candidate.name)}
                className="rounded-md border border-border px-1.5 py-0.5 text-2xs transition-colors hover:bg-muted"
                title={candidate.name}
              >
                {candidate.symbol}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="shrink-0">
        {row.already ? (
          <Badge variant="secondary" size="sm">
            <CheckIcon aria-hidden />
            In list
          </Badge>
        ) : resolution.status === 'ambiguous' ? (
          <Badge variant="warning" size="sm">
            Which one?
          </Badge>
        ) : resolution.status === 'unknown' ? (
          <Badge variant="neutral" size="sm">
            <XIcon aria-hidden />
            Not found
          </Badge>
        ) : resolution.via !== 'symbol' ? (
          <Badge variant="outline" size="sm" title={`Matched by ${resolution.via}`}>
            by {resolution.via}
          </Badge>
        ) : null}
      </div>
    </li>
  );
}
