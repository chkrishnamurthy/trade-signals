import Link from 'next/link';
import type { ReactNode } from 'react';

/** The framed card every auth page shares: brand, title, body, and a footer link. */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
      <Link href="/watchlists" className="text-sm font-semibold tracking-tight text-foreground">
        EquityWise
      </Link>
      <h1 className="mt-4 text-lg font-semibold tracking-tight text-foreground">{title}</h1>
      {subtitle !== undefined ? (
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      ) : null}
      <div className="mt-5">{children}</div>
      {footer !== undefined ? (
        <div className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">{footer}</div>
      ) : null}
    </div>
  );
}
