import { listUsers } from '@equitywise/db';
import { redirect } from 'next/navigation';
import { AdminUsers } from '@/components/auth/admin-users';
import { getAdminUser } from '@/server/auth/require-user';
import { getDatabase } from '@/server/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — EquityWise' };

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

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="font-semibold text-xl tracking-tight text-foreground">Users</h1>
        <a href="/watchlists" className="text-muted-foreground text-sm hover:text-foreground">
          ← Back to app
        </a>
      </div>
      <AdminUsers initial={rows} adminId={admin.id} />
    </main>
  );
}
