'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { API_ROUTES } from '@/lib/api-routes';

interface Row {
  id: number;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  emailVerified: boolean;
  createdAt: string;
}

/** The admin operator table: disable/enable and promote/demote other accounts. */
export function AdminUsers({ initial, adminId }: { initial: Row[]; adminId: number }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [busy, setBusy] = useState<number | null>(null);

  async function patch(id: number, body: Partial<Pick<Row, 'status' | 'role'>>) {
    setBusy(id);
    try {
      const res = await fetch(API_ROUTES.adminUser(id), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...body } : r)));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-muted-foreground text-xs">
          <tr>
            <th className="px-4 py-2 font-medium">User</th>
            <th className="px-4 py-2 font-medium">Role</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Joined</th>
            <th className="px-4 py-2 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isSelf = r.id === adminId;
            return (
              <tr key={r.id} className="border-border border-t">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-foreground">{r.displayName}</div>
                  <div className="text-muted-foreground text-xs">
                    {r.email}
                    {r.emailVerified ? '' : ' · unverified'}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant={r.role === 'admin' ? 'default' : 'secondary'}>{r.role}</Badge>
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant={r.status === 'active' ? 'secondary' : 'destructive'}>
                    {r.status}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground text-xs">
                  {new Date(r.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {isSelf ? (
                    <span className="text-muted-foreground text-xs">you</span>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy === r.id}
                        onClick={() =>
                          patch(r.id, { role: r.role === 'admin' ? 'user' : 'admin' })
                        }
                      >
                        {r.role === 'admin' ? 'Demote' : 'Make admin'}
                      </Button>
                      <Button
                        variant={r.status === 'active' ? 'ghost' : 'outline'}
                        size="sm"
                        disabled={busy === r.id}
                        onClick={() =>
                          patch(r.id, { status: r.status === 'active' ? 'disabled' : 'active' })
                        }
                      >
                        {r.status === 'active' ? 'Disable' : 'Enable'}
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
