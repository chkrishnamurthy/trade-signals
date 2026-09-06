import Link from 'next/link';

export const metadata = { title: 'Terms of Service — EquityWise' };

/** Placeholder terms. Full text required before public launch (auth plan §23). */
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-semibold text-2xl tracking-tight text-foreground">Terms of Service</h1>
      <p className="mt-4 text-muted-foreground text-sm">
        EquityWise provides technical analysis and screening of NSE equities for decision support
        only. It is not investment advice, not a broker, and never places orders. Use it at your own
        discretion. Do not abuse the service or attempt to access other users' data.
      </p>
      <p className="mt-4 text-muted-foreground text-sm">
        This is a summary placeholder; the full terms will be published before public launch.
      </p>
      <Link href="/signup" className="mt-8 inline-block text-foreground text-sm hover:underline">
        ← Back
      </Link>
    </main>
  );
}
