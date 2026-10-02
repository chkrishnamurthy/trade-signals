import Link from 'next/link';
import { EmptyState } from '@/components/data-display/states';
import { AppShell } from '@/components/layout/app-shell';
import { PageContainer, PageContent } from '@/components/layout/page';
import { Button } from '@/components/ui/button';

export default function IpoNotFound() {
  return (
    <AppShell>
      <PageContainer>
        <PageContent>
          <EmptyState
            title="IPO not found"
            description="This issue isn't in EquityWise's list. It may have been renamed, or the link may be mistyped."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/ipos">All IPOs</Link>
              </Button>
            }
          />
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
