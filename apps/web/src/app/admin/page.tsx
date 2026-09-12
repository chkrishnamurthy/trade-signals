import { listUsers } from '@equitywise/db';
import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
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
import { getAdminUser } from '@/server/auth/require-user';
import { getDatabase } from '@/server/db';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Admin — EquityWise',
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const admin = await getAdminUser();
  if (admin === null) redirect('/watchlists');

  const users = await listUsers(getDatabase());
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
              <Link href="/watchlists">
                <ArrowLeftIcon />
                Back to app
              </Link>
            </Button>
          </PageActions>
        </PageHeader>
        <AdminUsers initial={rows} adminId={admin.id} />
      </PageContainer>
    </AppShell>
  );
}
