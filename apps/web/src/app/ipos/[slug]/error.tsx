'use client';

import { ErrorState } from '@/components/data-display/states';
import { AppShell } from '@/components/layout/app-shell';
import { PageContainer, PageContent } from '@/components/layout/page';

export default function IpoDetailError({ reset }: { error: Error; reset: () => void }) {
  return (
    <AppShell>
      <PageContainer>
        <PageContent>
          <ErrorState
            title="Could not load this IPO"
            description="Something went wrong reading the issue. Please try again."
            onRetry={reset}
          />
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
