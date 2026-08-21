import Link from 'next/link';

/**
 * Entry point.
 *
 * Deliberately plain: the dashboard is the product, and this exists only to
 * route into it and into the daily re-authorisation when data stops flowing.
 */
export const metadata = {
  title: 'Signal — NSE market analysis',
  description: 'Track, screen and analyse NSE equities. Technical decision support.',
};

const SECTIONS = [
  {
    href: '/dashboard',
    title: 'Market dashboard',
    detail: 'Indices, breadth, sectors, movers, technical setups and swing candidates',
  },
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Signal</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          NSE market tracking, screening and technical analysis. Decision support — orders are
          placed elsewhere.
        </p>
      </div>

      <div className="grid gap-3">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-lg border border-slate-200 p-5 transition-colors hover:border-slate-400 dark:border-slate-800 dark:hover:border-slate-600"
          >
            <span className="font-medium">{section.title} →</span>
            <span className="mt-1 block text-sm text-slate-600 dark:text-slate-400">
              {section.detail}
            </span>
          </Link>
        ))}
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-500">
        Market data credentials expire daily.{' '}
        <a
          href="/login"
          className="underline underline-offset-4 hover:text-slate-900 dark:hover:text-slate-200"
        >
          Re-authorise the data source
        </a>
        .
      </p>
    </main>
  );
}
