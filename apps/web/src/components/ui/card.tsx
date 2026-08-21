import type { ReactNode } from 'react';

/** The dashboard's one card shell — every panel uses it, so density stays even. */
export function Card({
  title,
  subtitle,
  action,
  children,
  className = '',
  bodyClassName = '',
}: {
  // `| undefined` throughout: with exactOptionalPropertyTypes, an optional prop
  // will not accept an explicitly-undefined value, and callers routinely pass
  // one through from optional data.
  title?: string | undefined;
  subtitle?: string | undefined;
  action?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
  bodyClassName?: string | undefined;
}) {
  return (
    <section
      className={`flex flex-col rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/50 ${className}`}
    >
      {title !== undefined && (
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
            {subtitle !== undefined && (
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                {subtitle}
              </p>
            )}
          </div>
          {action}
        </header>
      )}
      <div className={`min-h-0 flex-1 ${bodyClassName || 'p-4'}`}>{children}</div>
    </section>
  );
}

/** Uniform skeleton so loading states look deliberate rather than broken. */
export function SkeletonRows({ rows = 5, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton, never reordered
          key={i}
          className="h-8 animate-pulse rounded bg-slate-100 dark:bg-slate-800/70"
        />
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string | undefined }) {
  return (
    <div className="flex h-full min-h-24 flex-col items-center justify-center px-4 py-8 text-center">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</p>
      {detail !== undefined && (
        <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">{detail}</p>
      )}
    </div>
  );
}
