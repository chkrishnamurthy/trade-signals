import { listUsers, portfolioUsageSummary } from '@equitywise/db';
import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { AdminUsers } from '@/components/auth/admin-users';
import { AppShell } from '@/components/layout/app-shell';
import {
  PageActions,
  PageContainer,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
} from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { requireAdminPage } from '@/server/auth/admin-page';
import { getDatabase } from '@/server/db';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Admin — EquityWise',
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const admin = await requireAdminPage();

  const [users, usage] = await Promise.all([
    listUsers(getDatabase()),
    portfolioUsageSummary(getDatabase()).catch(() => null),
  ]);
  const rows = users.map((u) => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    status: u.status,
    emailVerified: u.emailVerifiedAt !== null,
    createdAt: u.createdAt.toISOString(),
  }));

  // Same shell (sidebar + topbar) and full-width PageContainer as every other
  // page, so the admin screen inherits the app's navigation and spacing instead
  // of floating in a narrow centred column of its own.
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>Users</PageTitle>
            <PageDescription>Manage accounts, roles and access across EquityWise.</PageDescription>
          </PageHeading>
          <PageActions>
            <Button asChild variant="outline" size="sm">
              <Link href="/intraday">Intraday</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/paper-trading">Paper trading</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/paper">Paper trading health</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/ipos">IPO data health</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/logs">Event log</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/watchlists">
                <ArrowLeftIcon />
                Back to app
              </Link>
            </Button>
          </PageActions>
        </PageHeader>
        {usage !== null && (
          <section
            aria-labelledby="portfolio-usage-h"
            className="mb-6 rounded-lg border border-border bg-surface p-4 shadow-subtle"
          >
            <h2 id="portfolio-usage-h" className="text-sm font-semibold">
              Portfolio usage
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Counts only, across all users. Nobody's holdings are shown here or anywhere else.
            </p>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
              {[
                ['Opened the page', usage.users],
                ['Have entries now', usage.usersWithEntries],
                ['Imported a file', usage.usersWhoImported],
                ['Active in 7 days', usage.activeLast7Days],
                ['Came 30+ days ago', usage.eligibleFor30DayReturn],
                ['Came back after 30 days', usage.returnedAfter30Days],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        <AdminUsers initial={rows} adminId={admin.id} />
      </PageContainer>
    </AppShell>
  );
}
