'use client';

import { LayersIcon, TrendingUpIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SkeletonRows } from '@/components/data-display/states';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/typography';
import { API_ROUTES } from '@/lib/api-routes';
import { cn } from '@/lib/utils';
import type { WatchlistTemplateDto } from '@/lib/watchlist-types';

/**
 * Starter lists — one click from an empty page to a full table.
 *
 * Rendered wherever a user is about to make a list: the empty state, and the
 * "New watchlist" dialog. Each card names the index or sector, how many
 * stocks it carries, and creates a COPY the user then owns (the description
 * says so where it matters — a sector card is "N names from the configured
 * indices", not every company in that line of business).
 *
 * The templates are fetched once per mount; they are config, not data, and
 * change with a deploy.
 */
export function StarterLists({
  onPick,
  busyId,
  compact = false,
  className,
}: {
  onPick: (template: WatchlistTemplateDto) => void;
  /** The template being created right now, so its card can show it. */
  busyId?: string | null | undefined;
  /** Tighter cards for inside a dialog. */
  compact?: boolean;
  className?: string | undefined;
}) {
  const [templates, setTemplates] = useState<readonly WatchlistTemplateDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(API_ROUTES.watchlistTemplates, {
          signal: controller.signal,
          cache: 'no-store',
        });
        const payload = (await response.json()) as { templates?: readonly WatchlistTemplateDto[] };
        if (!controller.signal.aborted) setTemplates(payload.templates ?? []);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    })();
    return () => controller.abort();
  }, []);

  if (failed) return null;
  if (templates === null) return <SkeletonRows rows={2} className={className} />;
  if (templates.length === 0) return null;

  const indices = templates.filter((template) => template.kind === 'index');
  const sectors = templates.filter((template) => template.kind === 'sector');

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <TemplateGroup
        title="Indices"
        templates={indices}
        onPick={onPick}
        busyId={busyId}
        compact={compact}
      />
      <TemplateGroup
        title="Sectors"
        templates={sectors}
        onPick={onPick}
        busyId={busyId}
        compact={compact}
      />
    </div>
  );
}

function TemplateGroup({
  title,
  templates,
  onPick,
  busyId,
  compact,
}: {
  title: string;
  templates: readonly WatchlistTemplateDto[];
  onPick: (template: WatchlistTemplateDto) => void;
  busyId: string | null | undefined;
  compact: boolean;
}) {
  if (templates.length === 0) return null;
  return (
    <section>
      <Text as="h4" variant="overline" className="mb-1.5 block">
        {title}
      </Text>
      <ul
        className={cn(
          'grid gap-2',
          compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
        )}
      >
        {templates.map((template) => {
          const busy = busyId === template.id;
          const Icon = template.kind === 'index' ? TrendingUpIcon : LayersIcon;
          return (
            <li key={template.id}>
              <button
                type="button"
                onClick={() => onPick(template)}
                disabled={busyId !== null && busyId !== undefined}
                aria-busy={busy}
                title={template.description}
                className={cn(
                  'flex h-full w-full flex-col items-start gap-1 rounded-lg border border-border bg-surface text-left shadow-subtle transition-colors',
                  'hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:cursor-default disabled:opacity-60',
                  compact ? 'p-2.5' : 'p-3',
                  busy && 'border-primary',
                )}
              >
                <span className="flex w-full items-center gap-1.5">
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate text-xs font-semibold">{template.name}</span>
                </span>
                <Badge variant="secondary" size="sm">
                  {busy ? 'Creating…' : `${template.symbols.length} stocks`}
                </Badge>
                {!compact && (
                  <span className="line-clamp-2 text-2xs leading-snug text-muted-foreground">
                    {template.description}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
