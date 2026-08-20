import { formatPaise, MARKET_CLOSE_MINUTES, MARKET_OPEN_MINUTES } from '@signal/shared';

/**
 * Placeholder home page.
 *
 * It renders one formatted price purely as a wiring check: if the paise helper
 * resolves and Indian digit grouping shows up here, the shared package is
 * correctly linked into the Next build.
 */
export default function HomePage() {
  const sessionHours = `${formatMinutes(MARKET_OPEN_MINUTES)}–${formatMinutes(MARKET_CLOSE_MINUTES)} IST`;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">NSE Signal Platform</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Scaffold only. No signals, no schema, no market data yet.
        </p>
      </div>

      <dl className="grid gap-3 rounded-lg border border-slate-200 p-5 text-sm dark:border-slate-800">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-600 dark:text-slate-400">Continuous session</dt>
          <dd className="font-mono">{sessionHours}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-600 dark:text-slate-400">Price rendering</dt>
          <dd className="font-mono">{formatPaise(12455000)}</dd>
        </div>
      </dl>
    </main>
  );
}

function formatMinutes(minutesOfDay: number): string {
  const hour = Math.floor(minutesOfDay / 60);
  const minute = minutesOfDay % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
