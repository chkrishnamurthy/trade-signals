'use client';

import { useState } from 'react';
import type { ProfilePageData } from '@/app/profile/page';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AvatarUploader } from './avatar-uploader';
import { ProfileForm } from './profile-form';
import { SecurityTab } from './security-tab';

/** The profile surface: a live header plus the Profile / Account & Security tabs. */
export function ProfileTabs({ data }: { data: ProfilePageData }) {
  const [displayName, setDisplayName] = useState(data.profile.displayName);
  const [avatarUrl, setAvatarUrl] = useState(data.profile.avatarUrl);
  const [bio, setBio] = useState(data.profile.bio);
  const [timezone, setTimezone] = useState(data.profile.timezone);
  const [defaultWatchlistId, setDefaultWatchlistId] = useState(data.profile.defaultWatchlistId);

  const memberSince = new Date(data.memberSince).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Identity header — reflects saves immediately. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="font-semibold text-foreground text-lg">{displayName}</h2>
        {data.role === 'admin' ? (
          <Badge variant="default" size="sm">
            Admin
          </Badge>
        ) : null}
        {data.emailVerified ? (
          <Badge variant="bullish" size="sm">
            Verified
          </Badge>
        ) : (
          <Badge variant="warning" size="sm">
            Unverified
          </Badge>
        )}
        <span className="w-full text-muted-foreground text-sm sm:w-auto sm:before:mx-2 sm:before:content-['·']">
          {data.email} · Member since {memberSince}
        </span>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Account &amp; Security</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="pt-2">
          <div className="flex flex-col gap-6">
            <AvatarUploader
              displayName={displayName}
              avatarUrl={avatarUrl}
              onChange={setAvatarUrl}
            />
            <ProfileForm
              initial={{ displayName, bio: bio ?? '', timezone, defaultWatchlistId }}
              watchlists={data.watchlists}
              onSaved={(v) => {
                setDisplayName(v.displayName);
                setBio(v.bio);
                setTimezone(v.timezone);
                setDefaultWatchlistId(v.defaultWatchlistId);
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="security" className="pt-2">
          <SecurityTab email={data.email} emailVerified={data.emailVerified} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
