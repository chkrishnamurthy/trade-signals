import { AlertTriangleIcon, ClockIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Text } from '@/components/ui/typography';
import { istDayTime } from '@/lib/ipo-format';
import type { IpoFeedStatusDto } from '@/lib/ipo-types';

/**
 * Data freshness for the IPO pages (plan §10.1). One quiet line when every
 * feed is current; an alert naming the feed and the reason when one has
 * failed or gone stale — never a silent "stale".
 */
export function IpoFeeds({
  feeds,
  showAsOf = true,
}: {
  feeds: readonly IpoFeedStatusDto[];
  /** Off where the page header already carries the as-of time. */
  showAsOf?: boolean | undefined;
}) {
  const official = feeds.find((f) => f.id.endsWith('-calendar'));
  const problems = feeds.filter((f) => f.status === 'failed' || f.status === 'stale');
  const allEmpty = feeds.length > 0 && feeds.every((f) => f.status === 'empty');

  if (allEmpty)
    return (
      <Alert>
        <ClockIcon aria-hidden />
        <AlertTitle>IPO data hasn&apos;t been collected yet</AlertTitle>
        <AlertDescription>
          The first collection runs on the worker&apos;s next scheduled pass. This page fills in
          automatically.
        </AlertDescription>
      </Alert>
    );

  if (!showAsOf && problems.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {showAsOf && (
        <Text variant="micro" className="flex flex-wrap items-center gap-x-1">
          <ClockIcon aria-hidden className="size-3" />
          {official?.lastSuccessAt
            ? `Exchange data as of ${istDayTime(official.lastSuccessAt)} IST.`
            : 'Exchange data not collected yet.'}
          <span>Times are IST; figures are as published.</span>
        </Text>
      )}
      {problems.length > 0 && (
        <Alert variant="warning" className="dark:text-warning">
          <AlertTriangleIcon aria-hidden />
          <AlertTitle>Some IPO data may be out of date</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {problems.map((feed) => (
                <li key={feed.id}>
                  {feed.label}:{' '}
                  {feed.status === 'failed'
                    ? `the last update failed${feed.lastSuccessAt ? `; showing data from ${istDayTime(feed.lastSuccessAt)} IST` : ''}`
                    : `last updated ${istDayTime(feed.lastSuccessAt)} IST`}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
