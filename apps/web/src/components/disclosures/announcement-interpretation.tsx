'use client';

import {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_STATUSES,
  type AnnouncementFact,
  officialAnnouncementUrl,
} from '@equitywise/core';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { AnnouncementDto } from '@/lib/disclosure-types';
import { formatDateTimeIst } from './parts';

export function AnnouncementActions({ row }: { row: AnnouncementDto }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function update(patch: Partial<AnnouncementDto['userState']>) {
    setPending(true);
    setError(false);
    try {
      const result = await fetch(`/api/announcements/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!result.ok) throw new Error('State update failed');
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => void update({ read: !row.userState.read })}
      >
        {row.userState.read ? 'Mark unread' : 'Mark read'}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        aria-pressed={row.userState.saved}
        onClick={() => void update({ saved: !row.userState.saved })}
      >
        {row.userState.saved ? 'Unsave' : 'Save'}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => void update({ dismissed: !row.userState.dismissed })}
      >
        {row.userState.dismissed ? 'Restore' : 'Dismiss'}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending || row.userState.issueReported}
        onClick={() => void update({ issueReported: true })}
      >
        {row.userState.issueReported ? 'Issue flagged in your account' : 'Flag an issue'}
      </Button>
      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          Could not save your change. Please retry.
        </p>
      )}
    </div>
  );
}

function Facts({
  facts,
  sourceUrl,
}: {
  facts: readonly AnnouncementFact[];
  sourceUrl: string | null;
}) {
  if (facts.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No explicitly labelled values were extracted from the available text. The attachment may
        contain them.
      </p>
    );
  return (
    <dl className="space-y-4">
      {facts.map((fact) => (
        <div key={`${fact.evidence.field}-${fact.evidence.start}`}>
          <dt className="text-sm font-medium">{fact.label}</dt>
          <dd className="whitespace-pre-wrap break-words text-sm">
            {fact.value}
            <details className="mt-1 text-xs text-muted-foreground">
              <summary className="cursor-pointer">
                Source: {fact.evidence.field}, characters {fact.evidence.start + 1}–
                {fact.evidence.end}
              </summary>
              <blockquote className="my-2 whitespace-pre-wrap border-l-2 border-border pl-3">
                {fact.evidence.excerpt}
              </blockquote>
              {sourceUrl && (
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                  Read original filing
                </a>
              )}
            </details>
          </dd>
        </div>
      ))}
    </dl>
  );
}
const historySchema = z.array(
  z.object({
    id: z.number(),
    createdAt: z.string(),
    checksum: z.string().nullable(),
    snapshot: z.object({
      headline: z.string(),
      detail: z.string().nullable(),
      announcedAt: z.string(),
      attachmentUrl: z.string().nullable(),
      category: z.string().nullable(),
    }),
  }),
);
function History({ id }: { id: number }) {
  const [history, setHistory] = useState<z.infer<typeof historySchema> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    void fetch(`/api/announcements/${id}?attempt=${attempt}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (result) => {
        if (!result.ok) throw new Error('History unavailable');
        const rows = historySchema.parse(await result.json());
        if (!controller.signal.aborted) setHistory(rows);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [id, attempt]);
  if (failed)
    return (
      <div role="alert">
        Version history could not be loaded.{' '}
        <Button variant="ghost" onClick={() => setAttempt((value) => value + 1)}>
          Retry
        </Button>
      </div>
    );
  if (history === null)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading stored versions…
      </p>
    );
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Up to 50 stored versions, newest first. Separate filings and cross-exchange duplicates are
        not automatically linked.
      </p>
      {history.length === 0 && (
        <p className="text-sm">No preserved version yet. Interpretation is pending.</p>
      )}
      {history.map((version, index) => (
        <details key={version.id} className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-sm">
            {index === 0 ? 'Latest stored version' : 'Earlier version'} · captured{' '}
            {formatDateTimeIst(version.createdAt)} IST
          </summary>
          <p className="mt-2 text-sm font-medium">{version.snapshot.headline}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Original category: {version.snapshot.category ?? 'Not supplied'}
          </p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">
            {version.snapshot.detail ?? 'No description supplied.'}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Filing time: {formatDateTimeIst(version.snapshot.announcedAt)} IST
          </p>
          <p className="mt-2 break-all text-xs text-muted-foreground">
            Metadata checksum: {version.checksum ?? 'Legacy snapshot; checksum unavailable'}
          </p>
          {officialAnnouncementUrl(version.snapshot.attachmentUrl) && (
            <a
              className="text-sm underline"
              href={officialAnnouncementUrl(version.snapshot.attachmentUrl) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
            >
              Original source for this version
            </a>
          )}
        </details>
      ))}
    </div>
  );
}
export function AnnouncementInterpretationSheet({ row }: { row: AnnouncementDto }) {
  const item = row.interpretation;
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          View interpretation
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-2xl motion-reduce:animate-none">
        <SheetHeader>
          <div className="min-w-0 pr-6">
            <SheetTitle>{row.companyName || row.symbol}</SheetTitle>
            <SheetDescription className="whitespace-normal">
              Filing facts, context and unknowns
            </SheetDescription>
          </div>
        </SheetHeader>
        <SheetBody className="space-y-6">
          <section className="space-y-2">
            <h2 className="text-base font-semibold">Plain-language summary</h2>
            <p className="text-sm">
              {item?.summary ??
                (row.attachmentUrl === null
                  ? 'Interpretation is unavailable because a valid original attachment link is missing.'
                  : 'An interpretation is not available yet. Read the original company filing.')}
            </p>
            <p className="text-sm text-muted-foreground">
              {item
                ? 'Deterministic interpretation of exchange metadata. Attachment not analysed.'
                : row.attachmentUrl === null
                  ? 'Source attachment unavailable.'
                  : 'Interpretation pending.'}
            </p>
            {item && (
              <p className="text-sm">
                {ANNOUNCEMENT_CATEGORIES[item.category]} · {ANNOUNCEMENT_STATUSES[item.eventStatus]}
              </p>
            )}
            {item?.statusEvidence && (
              <blockquote className="border-l-2 border-border pl-3 text-sm">
                {item.statusEvidence.excerpt}
              </blockquote>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Official facts</h2>
            <Facts facts={item?.facts ?? []} sourceUrl={row.attachmentUrl} />
          </section>
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Why it may matter</h2>
            {item?.relevance.length ? (
              item.relevance.map((area) => (
                <div key={area.area}>
                  <h3 className="text-sm font-medium">{area.area}</h3>
                  <p className="text-sm">{area.explanation}</p>
                  <details className="mt-1 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">
                      Classification evidence · {area.evidence.field}
                    </summary>
                    <blockquote className="mt-2 whitespace-pre-wrap">
                      {area.evidence.excerpt}
                    </blockquote>
                  </details>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Business relevance has not been established.
              </p>
            )}
            {row.watchlistNames.length > 0 && (
              <p className="text-sm">
                Relevant to your watchlists: {row.watchlistNames.join(', ')}.
              </p>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="text-base font-semibold">What remains unknown</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              {(
                item?.unknowns ?? [
                  'The filing attachment has not been analysed. Important facts and event status remain unverified.',
                ]
              ).map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </section>
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Important dates</h2>
            <p className="text-sm text-muted-foreground">
              Dates below retain the company's wording. An expected date does not establish
              completion.
            </p>
            <Facts facts={item?.importantDates ?? []} sourceUrl={row.attachmentUrl} />
          </section>
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Stored filing history</h2>
            <History id={row.id} />
          </section>
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Source and provenance</h2>
            <dl className="space-y-2 break-words text-sm">
              <div>
                <dt className="font-medium">Original title</dt>
                <dd>{row.headline}</dd>
              </div>
              <div>
                <dt className="font-medium">Original description</dt>
                <dd className="whitespace-pre-wrap">{row.detail ?? 'Not supplied'}</dd>
              </div>
              <div>
                <dt className="font-medium">Source / filing ID</dt>
                <dd>
                  {row.source.toUpperCase()} · {row.externalId}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Original category</dt>
                <dd>{row.category ?? 'Not supplied'}</dd>
              </div>
              <div>
                <dt className="font-medium">Filing time</dt>
                <dd>{formatDateTimeIst(row.announcedAt)} IST</dd>
              </div>
              <div>
                <dt className="font-medium">First ingested</dt>
                <dd>{formatDateTimeIst(row.ingestedAt)} IST</dd>
              </div>
              <div>
                <dt className="font-medium">Interpretation method</dt>
                <dd>{item?.method ?? 'Pending'} · no AI</dd>
              </div>
              <div>
                <dt className="font-medium">Metadata checksum (not document checksum)</dt>
                <dd className="break-all">{row.interpretationChecksum ?? 'Unavailable'}</dd>
              </div>
            </dl>
            {row.attachmentUrl ? (
              <Button asChild variant="outline">
                <a href={row.attachmentUrl} target="_blank" rel="noopener noreferrer">
                  Read original filing
                </a>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                A valid original attachment link is unavailable. Verify this filing on the exchange
                website.
              </p>
            )}
            {item?.warnings.map((warning) => (
              <p key={warning} className="text-xs text-muted-foreground">
                {warning}
              </p>
            ))}
          </section>
          <AnnouncementActions row={row} />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
