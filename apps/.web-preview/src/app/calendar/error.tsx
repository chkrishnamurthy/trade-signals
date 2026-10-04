'use client';

import { ErrorState } from '@/components/data-display/states';
import { AppShell } from '@/components/layout/app-shell';
import {
  PageContainer,
  PageContent,
  PageHeader,
  PageHeading,
  PageTitle,
} from '@/components/layout/page';

export default function MarketCalendarError({ reset }: { error: Error; reset: () => void }) {
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>Market Calendar</PageTitle>
          </PageHeading>
        </PageHeader>
        <PageContent>
          <ErrorState
            title="Could not load the market calendar"
            description="The stored event calendar is temporarily unavailable."
            onRetry={reset}
          />
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
