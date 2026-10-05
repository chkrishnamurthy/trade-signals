import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { IpoAdminHealth } from '@/components/ipos/ipo-admin-health';
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
import { getIpoAdminHealth } from '@/server/ipos';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'IPO data health — EquityWise',
  robots: { index: false, follow: false },
};

/** The IPO pipeline's operator view (plan Phase 9). Admin only; read-only. */
export default async function AdminIposPage() {
  await requireAdminPage();
  const health = await getIpoAdminHealth();
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>IPO data health</PageTitle>
            <PageDescription>Feeds, unmatched observations and source conflicts.</PageDescription>
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
          <IpoAdminHealth health={health} />
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
