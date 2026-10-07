import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { EventLogView } from '@/components/admin/event-log-view';
import { AppShell } from '@/components/layout/app-shell';
import {
  PageActions,
  PageContainer,
  PageContent,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
} from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { requireAdminPage } from '@/server/auth/admin-page';
import { eventLogQuerySchema, getEventLogPage } from '@/server/event-log';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Event log',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The durable event log (docs/planning/logging-plan.md, phase 4). Admin only; read-only. */
export default async function AdminLogsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminPage();
  const raw = await searchParams;
  // An empty form field arrives as "", which means "no filter", not "invalid".
  const cleaned = Object.fromEntries(
    Object.entries(raw)
      .map(([key, value]) => [key, Array.isArray(value) ? value[0] : value] as const)
      .filter(([, value]) => value !== undefined && value !== ''),
  );
  const parsed = eventLogQuerySchema.safeParse(cleaned);
  const query = parsed.success ? parsed.data : {};
  const data = await getEventLogPage(query);

  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>Event log</PageTitle>
            <PageDescription>
              Account actions, worker job failures and market-data credential changes. Append-only
              and read-only; routine successes are deliberately not recorded.
            </PageDescription>
          </PageHeading>
          <PageActions>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin">
                <ArrowLeftIcon />
                Admin
              </Link>
            </Button>
          </PageActions>
        </PageHeader>
        <PageContent>
          {!parsed.success && (
            <p role="alert" className="text-sm text-destructive">
              One of the filters was not valid and was ignored.
            </p>
          )}
          <EventLogView data={data} query={query} />
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
