import type { ReactNode } from 'react';
import { Brand } from '@/components/layout/brand';
import { cn } from '@/lib/utils';

/** The framed card every auth page shares: brand, title, body, and a footer link. */
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
        'mx-auto w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-elevated',
        className,
      )}
    >
      <Brand className="text-sm" />
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground">{title}</h1>
      {subtitle !== undefined ? (
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      ) : null}
      <div className="mt-5">{children}</div>
      {footer !== undefined ? (
        <div className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
