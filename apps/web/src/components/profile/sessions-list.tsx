'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { API_ROUTES } from '@/lib/api-routes';
import { sendJson } from './request';

interface Session {
  id: number;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  /** `mobile` sessions come from the Android app and carry the device name it sent. */
  client?: 'web' | 'mobile';
  deviceName?: string | null;
  isCurrent: boolean;
}

/** A readable device label from a user-agent string. Best-effort, never precise. */
function deviceLabel(ua: string | null): string {
  if (ua === null || ua === '') return 'Unknown device';
  const browser = /Edg/.test(ua)
    ? 'Edge'
    : /Chrome/.test(ua)
      ? 'Chrome'
      : /Safari/.test(ua)
        ? 'Safari'
        : /Firefox/.test(ua)
          ? 'Firefox'
          : 'Browser';
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Macintosh/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Unknown OS';
  return `${browser} on ${os}`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function SessionsList() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    fetch(API_ROUTES.accountSessions)
      .then((r) => r.json())
      .then((d: { sessions?: Session[] }) => {
        if (!cancelled) setSessions(d.sessions ?? []);
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function revokeOthers() {
    setBusy(true);
    const res = await sendJson<{ revoked: number }>(API_ROUTES.accountSessions, 'DELETE', {
      scope: 'others',
    });
    setBusy(false);
    if (res.ok) {
      setSessions((s) => (s === null ? s : s.filter((x) => x.isCurrent)));
      toast({ title: `Signed out ${res.data.revoked} other device(s)`, variant: 'success' });
    } else {
      toast({
        title: "Couldn't sign out other devices",
        description: res.error,
        variant: 'destructive',
      });
    }
  }

  async function revoke(id: number) {
    setBusy(true);
    const res = await sendJson(API_ROUTES.accountSessions, 'DELETE', { sessionId: id });
    setBusy(false);
    if (res.ok) {
      setSessions((s) => (s === null ? s : s.filter((x) => x.id !== id)));
      toast({ title: 'Device signed out', variant: 'success' });
    } else {
      toast({ title: "Couldn't sign out device", description: res.error, variant: 'destructive' });
    }
  }

  const others = sessions?.filter((s) => !s.isCurrent).length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardHeading>
          <CardTitle>Active sessions</CardTitle>
          <CardDescription>Devices currently signed in to your account.</CardDescription>
        </CardHeading>
        {others > 0 ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void revokeOthers()}>
            Sign out other devices
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {sessions === null ? (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="p-4 text-muted-foreground text-sm">No active sessions.</p>
        ) : (
          <ul className="divide-y divide-border">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-foreground text-sm">
                      {s.client === 'mobile'
                        ? `${s.deviceName ?? 'Android phone'} · EquityWise app`
                        : deviceLabel(s.userAgent)}
                    </span>
                    {s.isCurrent ? (
                      <Badge variant="bullish" size="sm">
                        This device
                      </Badge>
                    ) : null}
                  </div>
                  <div className="truncate text-muted-foreground text-xs">
                    {s.ipAddress ?? 'unknown IP'} · active {relativeTime(s.lastUsedAt)}
                  </div>
                </div>
                {s.isCurrent ? (
                  <span className="shrink-0 text-muted-foreground text-xs">Current</span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void revoke(s.id)}
                  >
                    Sign out
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
