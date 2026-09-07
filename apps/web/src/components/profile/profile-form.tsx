'use client';

import { useMemo, useState } from 'react';
import { FormControl, FormField, FormLabel, FormMessage } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { API_ROUTES } from '@/lib/api-routes';
import { sendJson } from './request';

const MAX_NAME = 50;
const MAX_BIO = 280;
const NO_DEFAULT = 'none';

/** A small, practical timezone list. Asia/Kolkata is the NSE default. */
const TIMEZONES = [
  'Asia/Kolkata',
  'UTC',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
];

interface FormValues {
  displayName: string;
  bio: string;
  timezone: string;
  defaultWatchlistId: number | null;
}

export function ProfileForm({
  initial,
  watchlists,
  onSaved,
}: {
  initial: FormValues;
  watchlists: readonly { id: number; name: string }[];
  onSaved: (v: {
    displayName: string;
    bio: string | null;
    timezone: string;
    defaultWatchlistId: number | null;
  }) => void;
}) {
  const [values, setValues] = useState<FormValues>(initial);
  const [saved, setSaved] = useState<FormValues>(initial);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  // Timezone list always contains the user's current one, even if it's exotic.
  const zones = useMemo(
    () => (TIMEZONES.includes(saved.timezone) ? TIMEZONES : [saved.timezone, ...TIMEZONES]),
    [saved.timezone],
  );

  const dirty =
    values.displayName !== saved.displayName ||
    values.bio !== saved.bio ||
    values.timezone !== saved.timezone ||
    values.defaultWatchlistId !== saved.defaultWatchlistId;

  const nameError = values.displayName.trim().length === 0 ? 'A display name is required.' : null;
  const canSave = dirty && nameError === null && !busy;

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function save() {
    if (!canSave) return;
    setBusy(true);
    // Send only the fields that changed.
    const patch: Record<string, unknown> = {};
    if (values.displayName !== saved.displayName) patch.displayName = values.displayName.trim();
    if (values.bio !== saved.bio) patch.bio = values.bio;
    if (values.timezone !== saved.timezone) patch.timezone = values.timezone;
    if (values.defaultWatchlistId !== saved.defaultWatchlistId) {
      patch.preferences = { defaultWatchlistId: values.defaultWatchlistId };
    }

    const res = await sendJson(API_ROUTES.profile, 'PATCH', patch);
    setBusy(false);
    if (res.ok) {
      const next = { ...values, displayName: values.displayName.trim() };
      setValues(next);
      setSaved(next);
      onSaved({
        displayName: next.displayName,
        bio: next.bio.trim() === '' ? null : next.bio,
        timezone: next.timezone,
        defaultWatchlistId: next.defaultWatchlistId,
      });
      toast({ title: 'Profile saved', variant: 'success' });
    } else {
      toast({ title: "Couldn't save", description: res.error, variant: 'destructive' });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <FormField invalid={nameError !== null}>
        <FormLabel>Display name</FormLabel>
        <FormControl>
          <Input
            value={values.displayName}
            maxLength={MAX_NAME}
            onChange={(e) => set('displayName', e.target.value)}
          />
        </FormControl>
        <FormMessage>{nameError}</FormMessage>
      </FormField>

      <FormField>
        <div className="flex items-baseline justify-between">
          <FormLabel>Bio</FormLabel>
          <span className="text-xs text-muted-foreground">
            {values.bio.length}/{MAX_BIO}
          </span>
        </div>
        <FormControl>
          <Textarea
            rows={3}
            value={values.bio}
            maxLength={MAX_BIO}
            placeholder="A short line about how you trade — optional."
            onChange={(e) => set('bio', e.target.value)}
          />
        </FormControl>
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField>
          <FormLabel>Timezone</FormLabel>
          <Select value={values.timezone} onValueChange={(v) => set('timezone', v)}>
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {zones.map((z) => (
                <SelectItem key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField>
          <FormLabel>Default watchlist</FormLabel>
          <Select
            value={
              values.defaultWatchlistId === null ? NO_DEFAULT : String(values.defaultWatchlistId)
            }
            onValueChange={(v) => set('defaultWatchlistId', v === NO_DEFAULT ? null : Number(v))}
          >
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="None" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value={NO_DEFAULT}>None</SelectItem>
              {watchlists.map((w) => (
                <SelectItem key={w.id} value={String(w.id)}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      {/* Sticky save bar — only present while there are unsaved changes. */}
      {dirty ? (
        <div className="sticky bottom-3 z-10 flex items-center justify-end gap-2 rounded-lg border border-border bg-surface-raised/95 px-3 py-2 shadow-elevated backdrop-blur">
          <span className="mr-auto text-muted-foreground text-xs">Unsaved changes</span>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setValues(saved)}>
            Discard
          </Button>
          <Button size="sm" disabled={!canSave} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
