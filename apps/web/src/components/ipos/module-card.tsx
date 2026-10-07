import { ExternalLinkIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import type * as React from 'react';
import { Card } from '@/components/ui/card';
import type { IpoTone } from '@/lib/ipo-format';
import { cn } from '@/lib/utils';
import { CardNote } from './card-note';
import { TONE_ROW } from './ipo-chip';

/**
 * The IPO dashboard's module: a titled card holding one short table, with a
 * footer line and a "view all" link — Chittorgarh's grid of compact tables,
 * with every module saying where its figures come from.
 */
export function ModuleCard({
  id,
  title,
  note,
  aside,
  footer,
  link,
  unofficial = false,
  className,
  children,
}: {
  id: string;
  title: string;
  note?: React.ReactNode;
  /** Header-right: a legend or the "Unofficial" tag. */
  aside?: React.ReactNode;
  footer?: React.ReactNode;
  link?: { readonly href: Route; readonly label: string } | undefined;
  /** Fences a grey-market module off in amber. */
  unofficial?: boolean | undefined;
  className?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <Card
      aria-labelledby={id}
      className={cn('overflow-hidden', unofficial && 'border-warning-line', className)}
    >
      <header
        className={cn(
          'flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 pt-3.5 pb-3',
          unofficial && 'bg-warning-soft/40',
        )}
      >
        <div className="min-w-0 flex-1 basis-56">
          <h2 id={id} className="scroll-mt-32 font-semibold text-sm tracking-tight">
            {title}
          </h2>
          {note !== undefined && <CardNote>{note}</CardNote>}
        </div>
        {aside}
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
      {(footer !== undefined || link !== undefined) && (
        <footer className="flex flex-col border-border border-t text-muted-foreground text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4 sm:py-2.5">
          {footer !== undefined && <div className="px-4 py-2.5 sm:p-0">{footer}</div>}
          {link !== undefined && (
            <Link
              href={link.href}
              className={cn(
                'flex min-h-11 items-center justify-center px-4 font-medium text-primary-strong text-sm underline-offset-4 hover:underline sm:min-h-0 sm:shrink-0 sm:p-0 sm:text-xs',
                footer !== undefined && 'border-border border-t sm:border-0',
              )}
            >
              {link.label} →
            </Link>
          )}
        </footer>
      )}
    </Card>
  );
}

export interface ModuleColumn<T> {
  readonly id: string;
  readonly header: React.ReactNode;
  /** A Tailwind width for the column (`w-28`); the first column takes the rest. */
  readonly width?: string;
  readonly align?: 'end';
  readonly cell: (row: T) => React.ReactNode;
}

export interface MobileRow {
  readonly title: React.ReactNode;
  readonly sub?: React.ReactNode;
  readonly value?: React.ReactNode;
  readonly valueSub?: React.ReactNode;
  /** The whole phone row is one tap target when it leads somewhere. */
  readonly href?: string | undefined;
  readonly external?: boolean | undefined;
}

/**
 * One short table that reads at both widths. From `sm` up it is a real table
 * with fixed columns; on a phone each row folds to two lines — name and a
 * detail on the left, the figure on the right — instead of scrolling sideways.
 */
export function ModuleTable<T>({
  caption,
  rows,
  rowKey,
  columns,
  mobile,
  rowTone,
  empty,
}: {
  caption: string;
  rows: readonly T[];
  rowKey: (row: T) => string;
  columns: readonly ModuleColumn<T>[];
  mobile: (row: T) => MobileRow;
  rowTone?: ((row: T) => IpoTone | null) | undefined;
  empty: string;
}) {
  if (rows.length === 0)
    return (
      <p className="border-border border-t px-4 py-6 text-center text-muted-foreground text-sm">
        {empty}
      </p>
    );
  const tint = (row: T) => {
    const tone = rowTone?.(row) ?? null;
    return tone === null ? undefined : TONE_ROW[tone];
  };
  return (
    <>
      <table className="hidden w-full table-fixed border-collapse text-sm sm:table">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          {columns.map((c) => (
            <col key={c.id} className={c.width} />
          ))}
        </colgroup>
        <thead className="bg-surface-sunken text-muted-foreground text-xs">
          <tr className="border-border border-y">
            {columns.map((c) => (
              <th
                key={c.id}
                scope="col"
                className={cn(
                  'h-8 px-2 text-left font-normal first:pl-4 last:pr-4',
                  c.align === 'end' && 'text-right',
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className={cn('border-border border-b last:border-0', tint(row))}>
              {columns.map((c) => (
                <td
                  key={c.id}
                  className={cn(
                    'h-10 px-2 py-1.5 align-middle first:pl-4 last:pr-4',
                    c.align === 'end' && 'text-right',
                  )}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="border-border border-t sm:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li key={rowKey(row)} className={cn('border-border border-b last:border-0', tint(row))}>
            <PhoneRow {...mobile(row)} />
          </li>
        ))}
      </ul>
    </>
  );
}

function PhoneRow({ title, sub, value, valueSub, href, external = false }: MobileRow) {
  const body = (
    <>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-foreground text-sm">{title}</span>
        {sub !== undefined && <span className="text-muted-foreground text-xs">{sub}</span>}
      </span>
      {(value !== undefined || valueSub !== undefined) && (
        <span className="flex shrink-0 flex-col items-end text-right">
          {value !== undefined && <span className="text-sm">{value}</span>}
          {valueSub !== undefined && (
            <span className="text-muted-foreground text-xs">{valueSub}</span>
          )}
        </span>
      )}
      {external && (
        <ExternalLinkIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      )}
    </>
  );
  const row = 'flex min-h-11 items-center justify-between gap-3 px-4 py-2.5';
  if (href === undefined) return <div className={row}>{body}</div>;
  if (external)
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(row, 'hover:bg-accent/60')}
      >
        {body}
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    );
  return (
    <Link href={href as Route} className={cn(row, 'hover:bg-accent/60')}>
      {body}
    </Link>
  );
}

/** A company name that leads to its IPO page, truncated to its cell. */
export function IssueLink({ slug, name }: { slug: string; name: string }) {
  return (
    <Link
      href={`/ipos/${slug}` as Route}
      title={name}
      className="block truncate font-medium text-foreground underline-offset-4 hover:underline"
    >
      {name}
    </Link>
  );
}

/** A link to a page EquityWise does not host, marked as leaving the site. */
export function ExternalLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1 text-primary-strong underline-offset-4 hover:underline',
        className,
      )}
    >
      {children}
      <ExternalLinkIcon aria-hidden className="size-3 shrink-0" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/** A label and its value on one line, ruled above — the sidebar cards' row. */
export function FactRow({
  label,
  wrapLabel = false,
  className,
  children,
}: {
  label: React.ReactNode;
  /** A long label (a registrar's name) wraps and the short value keeps its width. */
  wrapLabel?: boolean;
  className?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 border-border border-t px-4 py-2.5 text-sm',
        className,
      )}
    >
      <span
        className={cn(
          'text-muted-foreground text-xs',
          wrapLabel ? 'min-w-0 break-words' : 'shrink-0',
        )}
      >
        {label}
      </span>
      <span className={cn('text-right', wrapLabel ? 'shrink-0' : 'min-w-0')}>{children}</span>
    </div>
  );
}
