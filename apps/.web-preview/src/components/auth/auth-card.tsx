import { ActivityIcon, LockKeyholeIcon, ShieldCheckIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Brand } from '@/components/layout/brand';
import { cn } from '@/lib/utils';

const TRUST_CUES: ReadonlyArray<{ icon: typeof ShieldCheckIcon; label: string }> = [
  { icon: ShieldCheckIcon, label: 'Private, account-scoped watchlists' },
  { icon: LockKeyholeIcon, label: 'First-party login — no third-party tracker' },
  { icon: ActivityIcon, label: 'Analysis & screening only, never orders' },
];

/**
 * The split-screen shell every auth page shares.
 *
 * A branded emerald panel on the left carries the story and the trust cues; the
 * form sits in a calm column on the right. On small screens the panel drops
 * away and the form takes the full width, with the wordmark restored above it.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        'mx-auto grid w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-elevated md:grid-cols-2',
        className,
      )}
    >
      {/* Brand panel — the emerald half. */}
      <div
        className="relative hidden flex-col justify-between gap-8 p-8 text-white md:flex"
        style={{
          background:
            'linear-gradient(155deg, var(--color-primary), color-mix(in oklab, var(--color-primary) 55%, #04140d))',
        }}
      >
        <Brand href="/" className="text-white [&_img]:brightness-0 [&_img]:invert" />

        <div className="space-y-3">
          <h2 className="font-display text-2xl font-bold leading-tight xl:text-3xl">
            The calm way to follow NSE stocks.
          </h2>
          <p className="max-w-xs text-sm leading-relaxed text-white/85">
            Watchlists, signals with a factor breakdown, and corporate filings the moment they land
            — each read explained in plain English.
          </p>
        </div>

        <ul className="space-y-2.5">
          {TRUST_CUES.map((cue) => {
            const Icon = cue.icon;
            return (
              <li key={cue.label} className="flex items-center gap-2.5 text-sm text-white/90">
                <Icon className="size-4 shrink-0 text-white" aria-hidden />
                {cue.label}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Form column. */}
      <div className="flex flex-col justify-center gap-1 p-6 sm:p-8">
        <div className="mb-4 md:hidden">
          <Brand className="text-sm" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {subtitle !== undefined ? (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
        <div className="mt-6">{children}</div>
        {footer !== undefined ? (
          <div className="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
