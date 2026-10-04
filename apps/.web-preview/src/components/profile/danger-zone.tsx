'use client';

import { useState } from 'react';
import { FormControl, FormField, FormLabel } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { API_ROUTES } from '@/lib/api-routes';
import { sendJson } from './request';

/** Permanent account deletion behind a re-auth + type-to-confirm dialog. */
export function DangerZone() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const canDelete = password !== '' && confirm === 'DELETE' && !busy;

  async function remove() {
    if (!canDelete) return;
    setBusy(true);
    const res = await sendJson(API_ROUTES.account, 'DELETE', { password, confirm });
    if (res.ok) {
      // Account (and session) are gone — leave the app.
      window.location.href = '/signup';
      return;
    }
    setBusy(false);
    toast({ title: "Couldn't delete account", description: res.error, variant: 'destructive' });
  }

  return (
    <Card className="border-destructive-line">
      <CardHeader className="border-destructive-line">
        <CardHeading>
          <CardTitle className="text-destructive">Delete account</CardTitle>
          <CardDescription>
            Permanently removes your account, watchlists, and saved views. This can't be undone.
          </CardDescription>
        </CardHeading>
      </CardHeader>
      <CardContent className="flex justify-end p-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="border-destructive-line text-destructive hover:bg-destructive-soft"
            >
              Delete my account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete your account?</DialogTitle>
              <DialogDescription>
                This permanently deletes everything you own. Enter your password and type{' '}
                <span className="font-medium text-foreground">DELETE</span> to confirm.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <FormField>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </FormControl>
              </FormField>
              <FormField>
                <FormLabel>Type DELETE</FormLabel>
                <FormControl>
                  <Input
                    value={confirm}
                    autoComplete="off"
                    placeholder="DELETE"
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </FormControl>
              </FormField>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost" size="sm" disabled={busy}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                size="sm"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={!canDelete}
                onClick={() => void remove()}
              >
                {busy ? 'Deleting…' : 'Delete account'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
