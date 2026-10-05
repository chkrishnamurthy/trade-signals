import type { Route } from 'next';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Overview / Analysis switch shared by the portfolio pages. */
export function PortfolioNav({ current }: { current: 'overview' | 'analysis' }) {
  const items = [
    { key: 'overview', href: '/portfolio', label: 'Overview' },
    { key: 'analysis', href: '/portfolio/analysis', label: 'Analysis' },
  ] as const;
  return (
    <nav aria-label="Portfolio sections" className="flex gap-1">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href as Route}
          aria-current={current === item.key ? 'page' : undefined}
          className={cn(
            'rounded-full px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring',
            current === item.key
              ? 'bg-primary/10 font-semibold text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
