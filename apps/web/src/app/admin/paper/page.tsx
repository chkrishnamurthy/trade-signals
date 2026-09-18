import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
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
import { PaperHealthView } from '@/components/paper/paper-health';
import { Button } from '@/components/ui/button';
import { getAdminUser } from '@/server/auth/require-user';
import { paperHealthReport } from '@/server/paper';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Paper trading health — EquityWise',
  robots: { index: false, follow: false },
};

/** The operator's view (plan §17): feed, cycles, portfolios, alerts — counts only, never a user's trades. */
export default async function AdminPaperPage() {
  const admin = await getAdminUser();
  if (admin === null) redirect('/watchlists');
  const health = await paperHealthReport(Date.now());
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>Paper trading health</PageTitle>
            <PageDescription>Feed, worker cycles, calendar and open alerts.</PageDescription>
          </PageHeading>
          <PageActions>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin">
                <ArrowLeftIcon className="size-4" aria-hidden />
                Admin
              </Link>
            </Button>
          </PageActions>
        </PageHeader>
        <PageContent>
          <PaperHealthView health={health} />
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
