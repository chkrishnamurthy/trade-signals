'use client';

import { Badge } from '@/components/ui/badge';
import type { StatementCheckDto, StatementCheckStatus } from '@/lib/portfolio-types';
import { longDate } from './portfolio-client';

/**
 * What a CAS check found: each stock on the statement or in the record, with
 * both share counts on the statement's date. Nothing is saved from it.
 */

const LABEL: Record<StatementCheckStatus, string> = {
  match: 'Matches',
  different: 'Different',
  not_in_record: 'Not in your record',
  not_in_statement: 'Not on the statement',
  unknown_stock: 'Not on our NSE list',
};

const VARIANT: Record<StatementCheckStatus, 'neutral' | 'warning' | 'outline'> = {
  match: 'neutral',
  different: 'warning',
  not_in_record: 'warning',
  not_in_statement: 'warning',
  unknown_stock: 'outline',
};

const count = (n: number | null) => (n === null ? '—' : n.toLocaleString('en-IN'));

export function StatementCheck({ result }: { result: StatementCheckDto }) {
  const { counts } = result;
  const issues = counts.different + counts.not_in_record + counts.not_in_statement;
  return (
    <section aria-labelledby="statement-check-h" className="flex flex-col gap-2">
      <h3 id="statement-check-h" className="text-sm font-semibold">
        Your record against the statement
        {result.statementDate === null ? '' : ` of ${longDate(result.statementDate)}`}
      </h3>
      <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
        {issues === 0
          ? `All ${counts.match} ${counts.match === 1 ? 'stock matches' : 'stocks match'} your record.`
          : `${counts.match} ${counts.match === 1 ? 'stock matches' : 'stocks match'}; ${issues} ${issues === 1 ? 'differs' : 'differ'}.`}{' '}
        Counted on {longDate(result.asOf)}, so entries after that day are not included. Nothing is
        saved from the statement; to change your record, add or edit entries.
      </p>
      <div className="max-h-72 overflow-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Each stock on the statement or in your record, with both share counts
          </caption>
          <thead className="sticky top-0 bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-2 py-1.5 font-medium">
                Stock
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                Statement
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                Your record
              </th>
              <th scope="col" className="px-2 py-1.5 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular-nums">
            {result.rows.map((r) => (
              <tr key={`${r.isin ?? ''}${r.symbol ?? ''}${r.name}`}>
                <th scope="row" className="px-2 py-1.5 text-left font-medium">
                  {r.symbol ?? r.name}
                  {r.symbol !== null && (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {r.name}
                    </span>
                  )}
                </th>
                <td className="px-2 py-1.5 text-right">{count(r.statementShares)}</td>
                <td className="px-2 py-1.5 text-right">{count(r.recordShares)}</td>
                <td className="px-2 py-1.5">
                  <Badge variant={VARIANT[r.status]}>{LABEL[r.status]}</Badge>
                  {r.status === 'different' &&
                    r.statementShares !== null &&
                    r.recordShares !== null && (
                      <span className="block text-xs text-muted-foreground">
                        {r.statementShares > r.recordShares ? 'Statement has' : 'Record has'}{' '}
                        {Math.abs(r.statementShares - r.recordShares).toLocaleString('en-IN')} more
                      </span>
                    )}
                  {r.statementCheck && (
                    <span className="block text-xs text-muted-foreground">
                      The statement line could not be cross-checked
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
