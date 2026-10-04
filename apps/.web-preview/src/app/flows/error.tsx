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

export default function FlowsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>Institutional Flow</PageTitle>
          </PageHeading>
        </PageHeader>
        <PageContent>
          <ErrorState
            title="Could not load institutional flow"
            description="Something went wrong fetching the disclosure data. Please try again."
            onRetry={reset}
          />
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
