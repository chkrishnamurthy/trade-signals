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

export default function PortfolioError({ reset }: { error: Error; reset: () => void }) {
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>Portfolio</PageTitle>
          </PageHeading>
        </PageHeader>
        <PageContent>
          <ErrorState
            title="We could not load your portfolio"
            description="Your entries are safe. Try again in a minute."
            onRetry={reset}
          />
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
