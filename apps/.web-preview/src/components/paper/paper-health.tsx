import type { PaperHealth } from '@equitywise/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardHeading, CardTitle } from '@/components/ui/card';
import { clock, time } from './format';

const ago = (at: number | null, now: number) =>
  at === null ? 'never' : `${Math.max(0, Math.round((now - at) / 1000))} s ago (${clock(at)} IST)`;

export function PaperHealthView({ health }: { health: PaperHealth }) {
  const red =
    health.openAfterCutoff > 0 ||
    health.ledgerMismatches > 0 ||
    health.calendar.expiresSoon ||
    health.feed.mode === 'STALE' ||
    health.feed.mode === 'UNAVAILABLE';
  const rows: [string, string, 'bullish' | 'warning' | 'destructive' | 'neutral'][] = [
    [
      'Session',
      `${health.session.tradingDate} · ${health.session.kind}${health.session.note ? ` · ${health.session.note}` : ''} · square-off ${time(health.session.squareOffAt)}`,
      'neutral',
    ],
    [
      'Calendar config',
      `verified through ${health.calendar.verifiedThrough}${health.calendar.expiresSoon ? ' — EXTEND IT' : ''}`,
      health.calendar.expiresSoon ? 'destructive' : 'bullish',
    ],
    [
      'Price feed',
      `${health.feed.mode} · last sample ${ago(health.feed.lastQuoteAt, health.serverNow)}`,
      health.feed.mode === 'LIVE'
        ? 'bullish'
        : health.feed.mode === 'CLOSED'
          ? 'neutral'
          : 'destructive',
    ],
    [
      'Worker socket',
      health.feed.socket === null
        ? 'not reported (worker not on this build, or never started the feed)'
        : `${health.feed.socket.provider ?? '?'} · ${health.feed.socket.state} · last tick ${ago(health.feed.socket.lastTickAt, health.serverNow)} · reported ${ago(health.feed.socket.reportedAt, health.serverNow)}${health.feed.socket.note ? ` · ${health.feed.socket.note}` : ''}`,
      health.feed.socket?.state === 'live' ? 'bullish' : 'warning',
    ],
    [
      'Portfolios',
      `${health.portfolios.total} total · ${health.portfolios.enabled} on · ${health.portfolios.withLiveTrades} with live paper trades`,
      'neutral',
    ],
    [
      'Open after the close',
      String(health.openAfterCutoff),
      health.openAfterCutoff > 0 ? 'destructive' : 'bullish',
    ],
    [
      'Ledger mismatches',
      String(health.ledgerMismatches),
      health.ledgerMismatches > 0 ? 'destructive' : 'bullish',
    ],
  ];
  return (
    <div className="space-y-4">
      <Badge variant={red ? 'destructive' : 'bullish'} size="lg">
        {red ? 'Attention needed' : 'All clear'}
      </Badge>
      <Card>
        <CardHeader>
          <CardHeading>
            <CardTitle>Status</CardTitle>
          </CardHeading>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            {rows.map(([k, v, tone]) => (
              <div key={k} className="rounded-md border border-border p-3 text-sm">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="mt-1 flex items-center gap-2">
                  <Badge variant={tone}>{tone === 'destructive' ? '!' : '•'}</Badge>
                  <span className="tabular-nums">{v}</span>
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardHeading>
            <CardTitle>Worker cycles</CardTitle>
          </CardHeading>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border text-sm">
            {Object.entries(health.lastCycles).map(([job, c]) => (
              <li key={job} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="font-medium">{job}</span>
                <span className="tabular-nums text-muted-foreground">
                  {c
                    ? `${ago(c.at, health.serverNow)} · ${JSON.stringify(c.cursor)}`
                    : 'no run recorded'}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardHeading>
            <CardTitle>Unresolved alerts</CardTitle>
          </CardHeading>
        </CardHeader>
        <CardContent>
          {health.unresolvedRiskEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">None.</p>
          ) : (
            <ul className="text-sm">
              {health.unresolvedRiskEvents.map((e) => (
                <li key={e.kind} className="flex justify-between py-1">
                  <span>{e.kind}</span>
                  <span className="tabular-nums">{e.count}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
