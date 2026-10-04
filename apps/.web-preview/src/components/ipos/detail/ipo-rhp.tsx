import type * as React from 'react';
import { longDate } from '@/lib/ipo-format';
import type { IpoDocumentDto, RhpExtractDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';
import { ExternalLink, ModuleCard } from '../module-card';

const HEADING: Readonly<Record<RhpExtractDto['section'], string>> = {
  overview: 'Company overview',
  objects: 'Objects of the issue',
  promoters: 'Promoters',
  financials: 'Restated financials',
  strengths: 'Strengths, as the company states them',
  risks: 'Risk factors, as the company states them',
};

/** PDF page numbers — what a PDF viewer shows, not the printed folio. */
function pages(extract: RhpExtractDto): string {
  return extract.pageTo !== extract.pageFrom
    ? `PDF pages ${extract.pageFrom}–${extract.pageTo}`
    : `PDF page ${extract.pageFrom}`;
}

/** Where a quote comes from: its pages, and the document itself. */
function Cite({ extract }: { extract: RhpExtractDto }) {
  return (
    <p className="text-2xs text-subtle-foreground">
      Auto-extracted from {pages(extract)} ·{' '}
      <ExternalLink href={extract.documentUrl} className="text-2xs">
        source document
      </ExternalLink>
    </p>
  );
}

function Block({
  extract,
  className,
  children,
}: {
  extract: RhpExtractDto;
  className?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={HEADING[extract.section]}
      className={cn('flex min-w-0 flex-col gap-1.5', className)}
    >
      {children}
      <Cite extract={extract} />
    </section>
  );
}

const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 className="font-medium text-sm">{children}</h3>
);

/** Tighter cells on phones, so three periods of figures fit at 375 px. */
const CELL = 'px-1.5 py-2 text-xs sm:px-3 sm:text-sm';

function Financials({ extract }: { extract: RhpExtractDto }) {
  const table = extract.table;
  if (table === null) return null;
  return (
    <Block extract={extract}>
      <H3>
        {HEADING.financials}{' '}
        <span className="font-normal text-muted-foreground">· in {table.unit}</span>
      </H3>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full border-collapse">
          <caption className="sr-only">
            {HEADING.financials}, in {table.unit}, figures as printed
          </caption>
          <thead className="bg-surface-sunken text-muted-foreground">
            <tr className="border-border border-b">
              <th scope="col" className={cn(CELL, 'text-left font-normal')}>
                Period
              </th>
              {table.columns.map((c) => (
                <th key={c} scope="col" className={cn(CELL, 'text-right font-normal')}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.label} className="border-border border-b last:border-0">
                <th scope="row" className={cn(CELL, 'text-left font-normal')}>
                  {row.label}
                </th>
                {row.values.map((v, i) => (
                  <td
                    key={`${row.label}-${table.columns[i] ?? i}`}
                    className={cn(CELL, 'figure whitespace-nowrap text-right')}
                  >
                    {v ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Block>
  );
}

function List({ extract }: { extract: RhpExtractDto }) {
  if (extract.section === 'promoters')
    return <p className="text-muted-foreground text-sm">{extract.items.join(', ')}</p>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-muted-foreground text-sm">
      {extract.items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * Sections read out of the RHP (plan Phase 11): the company's OWN statements,
 * quoted and cited by page — never EquityWise's opinion of the issue. When
 * nothing has been extracted the card points at the document itself.
 */
const DOCUMENT_NAME: Readonly<Record<string, string>> = {
  rhp: 'Red Herring Prospectus',
  prospectus: 'Prospectus',
  drhp: 'Draft Red Herring Prospectus',
};

export function IpoRhp({
  extracts,
  documents,
  openDate = null,
  readFrom = null,
}: {
  extracts: readonly RhpExtractDto[];
  documents: readonly IpoDocumentDto[];
  /** When bidding opened; with `readFrom`, says why an older document is only linked. */
  openDate?: string | null;
  /** The first issue date whose offer document EquityWise reads (`rhp.since`). */
  readFrom?: string | null;
}) {
  // A fixed-price issue files a Prospectus rather than an RHP.
  const rhp =
    documents.find((d) => d.kind === 'rhp') ??
    documents.find((d) => d.kind === 'prospectus') ??
    documents.find((d) => d.kind === 'drhp');
  const older = readFrom !== null && openDate !== null && openDate < readFrom;
  const get = (section: RhpExtractDto['section']) => extracts.find((e) => e.section === section);
  const overview = get('overview');
  const financials = get('financials');
  const sideBySide = [get('objects'), get('promoters')].filter(
    (e): e is RhpExtractDto => e !== undefined,
  );
  const strengths = get('strengths');
  const risks = get('risks');

  return (
    <ModuleCard
      id="company"
      title="From the offer document"
      note={
        extracts.length > 0
          ? 'Read automatically from the offer document and quoted as the company wrote it. Check the cited pages in the document.'
          : older
            ? `EquityWise quotes the offer documents of issues from ${longDate(readFrom ?? '')}; this earlier one is linked — the company overview, objects, promoters, financials and risk factors are in it.`
            : 'The company overview, objects, promoters, financials and risk factors are in the offer document.'
      }
    >
      <div className="flex flex-col gap-5 border-border border-t p-4">
        {extracts.length === 0 &&
          (rhp === undefined ? (
            <p className="text-muted-foreground text-sm">
              The offer document has not been published on the exchange yet.
            </p>
          ) : (
            <ExternalLink href={rhp.url} className="text-sm">
              Open the {DOCUMENT_NAME[rhp.kind] ?? 'offer document'} ({rhp.host})
            </ExternalLink>
          ))}
        {overview !== undefined && (
          <Block extract={overview}>
            <H3>{HEADING.overview}</H3>
            <blockquote className="whitespace-pre-line border-border-strong border-l-2 pl-3 text-muted-foreground text-sm">
              {overview.text}
            </blockquote>
          </Block>
        )}
        {financials !== undefined && <Financials extract={financials} />}
        {sideBySide.length > 0 && (
          <div className={cn('grid gap-5', sideBySide.length === 2 && 'md:grid-cols-2')}>
            {sideBySide.map((e) => (
              <Block key={e.section} extract={e}>
                <H3>{HEADING[e.section]}</H3>
                {e.text !== null && <p className="text-muted-foreground text-sm">{e.text}</p>}
                {e.items.length > 0 && <List extract={e} />}
              </Block>
            ))}
          </div>
        )}
        {strengths !== undefined && (
          <Block extract={strengths}>
            <H3>{HEADING.strengths}</H3>
            <List extract={strengths} />
          </Block>
        )}
        {risks !== undefined && risks.items.length > 0 && (
          <Block extract={risks}>
            {/* Risk headings run long; they stay one click away rather than filling the page. */}
            <details className="group rounded-md border border-border px-3 py-2.5">
              <summary className="cursor-pointer font-medium text-sm">
                {HEADING.risks} — first {risks.items.length}
              </summary>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted-foreground text-sm">
                {risks.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </details>
          </Block>
        )}
      </div>
    </ModuleCard>
  );
}
