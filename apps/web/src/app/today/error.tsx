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

/**
 * The route error boundary.
 *
 * A brief that throws unexpectedly (a database outage, say) lands here with a
 * retry. The internal error is never shown — it goes to the server logs, and
 * the user sees an actionable message. Expected data gaps do NOT reach this
 * boundary; they render as the in-page unavailable/partial/stale states.
 */
export default function TodayError({ reset }: { error: Error; reset: () => void }) {
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>Daily Market Brief</PageTitle>
          </PageHeading>
        </PageHeader>
        <PageContent>
          <ErrorState
            title="Could not load the market brief"
            description="Something went wrong while assembling this session's summary. Please try again."
            onRetry={reset}
          />
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
