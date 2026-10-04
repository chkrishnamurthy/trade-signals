'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { API_ROUTES } from '@/lib/api-routes';

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp';

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U'
  );
}

/** Circular avatar with change / remove controls. Uploads immediately on pick. */
export function AvatarUploader({
  displayName,
  avatarUrl,
  onChange,
}: {
  displayName: string;
  avatarUrl: string | null;
  onChange: (url: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function upload(file: File) {
    if (file.size > MAX_BYTES) {
      toast({
        title: 'Image too large',
        description: 'Choose a file 2 MB or smaller.',
        variant: 'warning',
      });
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(API_ROUTES.profileAvatar, { method: 'POST', body: form });
      const data = (await res.json().catch(() => ({}))) as { avatarUrl?: string; error?: string };
      if (res.ok && typeof data.avatarUrl === 'string') {
        onChange(data.avatarUrl);
        toast({ title: 'Photo updated', variant: 'success' });
      } else {
        toast({
          title: "Couldn't upload photo",
          ...(data.error ? { description: data.error } : {}),
          variant: 'destructive',
        });
      }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(API_ROUTES.profileAvatar, { method: 'DELETE' });
      if (res.ok) {
        onChange(null);
        toast({ title: 'Photo removed', variant: 'success' });
      } else {
        toast({ title: "Couldn't remove photo", variant: 'destructive' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      {avatarUrl !== null ? (
        // biome-ignore lint/performance/noImgElement: small user upload, not a layout image
        <img
          src={avatarUrl}
          alt=""
          className="size-16 shrink-0 rounded-full object-cover ring-1 ring-border"
        />
      ) : (
        <span className="grid size-16 shrink-0 place-items-center rounded-full bg-primary/15 font-medium text-lg text-primary ring-1 ring-border">
          {initialsOf(displayName)}
        </span>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? 'Working…' : 'Change photo'}
          </Button>
          {avatarUrl !== null ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void remove()}
            >
              Remove
            </Button>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">PNG, JPEG, or WebP · up to 2 MB.</p>
      </div>
    </div>
  );
}
