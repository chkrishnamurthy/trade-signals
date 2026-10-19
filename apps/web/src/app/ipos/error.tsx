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

export default function IposError({ reset }: { error: Error; reset: () => void }) {
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>IPOs</PageTitle>
          </PageHeading>
        </PageHeader>
        <PageContent>
          <ErrorState
            title="Could not load IPOs"
            description="Something went wrong reading the IPO data. Please try again."
            onRetry={reset}
          />
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
