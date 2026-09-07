'use client';

import { useState } from 'react';
import type { ProfilePageData } from '@/app/profile/page';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardHeading, CardTitle } from '@/components/ui/card';
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

  // Pinned locale + timezone so SSR and the client agree (a runtime-locale
  // format hydration-mismatches on a browser whose locale differs from the server).
  const memberSince = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(data.memberSince));

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
          {/* Two columns on wide screens so the profile tab fills the same
              page width as the rest of the app instead of a single narrow
              stack: a compact photo card beside the details form. */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardHeading>
                  <CardTitle>Profile photo</CardTitle>
                </CardHeading>
              </CardHeader>
              <CardContent>
                <AvatarUploader
                  displayName={displayName}
                  avatarUrl={avatarUrl}
                  onChange={setAvatarUrl}
                />
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardHeading>
                  <CardTitle>Details &amp; preferences</CardTitle>
                </CardHeading>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="security" className="pt-2">
          <SecurityTab email={data.email} emailVerified={data.emailVerified} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
