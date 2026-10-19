import type { Route } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardHeading, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { istDayTime } from '@/lib/ipo-format';
import type { IpoAdminHealthDto, IpoFeedState } from '@/lib/ipo-types';
import { CardNote } from './card-note';

const STATE: Readonly<
  Record<IpoFeedState, { label: string; tone: 'bullish' | 'warning' | 'destructive' | 'secondary' }>
> = {
  fresh: { label: 'Fresh', tone: 'bullish' },
  stale: { label: 'Stale', tone: 'warning' },
  failed: { label: 'Failed', tone: 'destructive' },
  empty: { label: 'Never run', tone: 'secondary' },
};

const JOBS = [
  'ingest-ipo-calendar',
  'ingest-ipo-details',
  'ingest-ipo-subscriptions',
  'ingest-ipo-listings',
  'ingest-ipo-gmp',
  'extract-ipo-rhp',
  'backfill-ipos',
] as const;

/**
 * The IPO pipeline's operator view (plan §9): feed health, observations no
 * issue claims (to review, never auto-merged), and official-source conflicts.
 * Read-only — there is no refresh button; jobs are run with `--once`.
 */
export function IpoAdminHealth({ health }: { health: IpoAdminHealthDto }) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardHeading>
            <CardTitle>Feeds</CardTitle>
            <CardNote>One row per source and feed, from feed_ingestion_runs.</CardNote>
          </CardHeading>
        </CardHeader>
        <CardContent flush>
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feed</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Last success</TableHead>
                  <TableHead>Last attempt</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {health.feeds.map((feed) => (
                  <TableRow key={feed.id}>
                    <TableCell>
                      <div className="font-medium">{feed.label}</div>
                      <div className="font-mono text-2xs text-muted-foreground">{feed.id}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATE[feed.status].tone}>{STATE[feed.status].label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{istDayTime(feed.lastSuccessAt)}</TableCell>
                    <TableCell className="text-xs">{istDayTime(feed.lastAttemptAt)}</TableCell>
                    <TableCell
                      className="max-w-72 truncate font-mono text-2xs"
                      title={feed.error ?? ''}
                    >
                      {feed.error ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardHeading>
            <CardTitle>Unmatched observations (14 days)</CardTitle>
            <CardNote>
              Rows no issue claims: a probable-only match, a BSE-only issue while BSE is off, or a
              GMP row whose dates disagree. Nothing here was merged on a guess.
            </CardNote>
          </CardHeading>
        </CardHeader>
        <CardContent flush>
          {health.unmatched.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">Nothing unmatched.</p>
          ) : (
            <TableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Last seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {health.unmatched.map((u) => (
                    <TableRow key={`${u.source}-${u.feed}-${u.externalKey}`}>
                      <TableCell className="text-xs">
                        {u.source} · {u.feed}
                      </TableCell>
                      <TableCell>
                        <a
                          href={u.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {u.companyName ?? '—'}
                        </a>
                      </TableCell>
                      <TableCell className="font-mono text-2xs">{u.externalKey}</TableCell>
                      <TableCell className="text-xs">{istDayTime(u.lastSeenAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardHeading>
            <CardTitle>Official-source conflicts</CardTitle>
            <CardNote>
              Fields where NSE and BSE disagree; the designated exchange&apos;s value is shown.
            </CardNote>
          </CardHeading>
        </CardHeader>
        <CardContent>
          {health.conflicts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No conflicts.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {health.conflicts.map((c) => (
                <li key={c.slug}>
                  <Link href={`/ipos/${c.slug}` as Route} className="font-medium hover:underline">
                    {c.companyName}
                  </Link>
                  <span className="text-muted-foreground"> — {c.fields.join(', ')}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardHeading>
            <CardTitle>RHP extraction</CardTitle>
            <CardNote>
              Red Herring Prospectuses read by the current extractor. A document that keeps failing
              is left alone until it is reset (docs/operations/ipo-pipeline.md).
            </CardNote>
          </CardHeading>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <dl className="grid grid-cols-3 gap-2">
            {(
              [
                ['Read', health.rhp.extracted],
                ['Waiting', health.rhp.pending],
                ['Given up', health.rhp.failed],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex flex-col">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {health.rhp.lastError !== null && (
            <p className="break-words font-mono text-2xs text-muted-foreground">
              Last error: {health.rhp.lastError}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardHeading>
            <CardTitle>Running a job by hand</CardTitle>
            <CardNote>On the VPS, as the deploy user. Every job is idempotent and paced.</CardNote>
          </CardHeading>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1 font-mono text-xs">
            {JOBS.map((job) => (
              <li key={job}>pnpm --filter @equitywise/worker start -- --once {job}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
