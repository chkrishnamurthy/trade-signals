import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import IpoLoading from '@/app/ipos/loading';
import {
  LoadingRegion,
  SkeletonChart,
  SkeletonForm,
  SkeletonList,
  SkeletonMetrics,
  SkeletonPanel,
  SkeletonTable,
  SkeletonText,
  SkeletonToolbar,
} from '@/components/data-display/loading';
import { IntradaySkeleton } from '@/components/intraday/intraday-skeleton';
import { IpoSectionLoading } from '@/components/ipos/ipo-section-loading';
import { PaperSkeleton } from '@/components/paper/paper-skeleton';
import {
  AnalysisLoading,
  AnnouncementsLoading,
  CalendarLoading,
  PortfolioLoading,
  ProfileLoading,
  ScreenerLoading,
  StockLoading,
  TodayLoading,
} from './page-skeletons';

/** Production components, frozen before data arrives. The global theme and
 * viewport tools cover light/dark and 375/768/1024/1440 without a parallel mock UI.
 * Shell requests are deliberately unresolved in this isolated preview. */
const meta = {
  title: 'Patterns/Loading system',
  parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } },
  beforeEach: () => {
    const original = globalThis.fetch;
    globalThis.fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      });
    return () => {
      globalThis.fetch = original;
    };
  },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Dashboard: Story = { render: () => <TodayLoading /> };
export const DataTable: Story = { render: () => <ScreenerLoading /> };
export const CardsAndFeed: Story = { render: () => <AnnouncementsLoading /> };
export const StockDetail: Story = { render: () => <StockLoading /> };
export const ProfileForm: Story = { render: () => <ProfileLoading /> };
export const Analytics: Story = { render: () => <AnalysisLoading /> };
export const Portfolio: Story = { render: () => <PortfolioLoading /> };
export const Calendar: Story = { render: () => <CalendarLoading /> };
export const IpoDashboard: Story = { render: () => <IpoLoading /> };
export const IpoCalendar: Story = { render: () => <IpoSectionLoading section="calendar" /> };
export const Intraday: Story = {
  render: () => (
    <div className="bg-background p-4">
      <IntradaySkeleton />
    </div>
  ),
};
export const Paper: Story = {
  render: () => (
    <div className="bg-background p-4">
      <PaperSkeleton />
    </div>
  ),
};
export const Drawer: Story = {
  render: () => (
    <div className="ml-auto min-h-screen max-w-lg border-l border-border bg-surface p-5">
      <h1 className="mb-5 font-semibold">Stock flow</h1>
      <LoadingRegion label="Loading stock flow">
        <div className="space-y-4">
          <SkeletonMetrics count={2} className="lg:grid-cols-2" />
          <SkeletonPanel>
            <SkeletonList rows={3} />
          </SkeletonPanel>
          <SkeletonTable rows={3} columns={3} />
        </div>
      </LoadingRegion>
    </div>
  ),
};
export const Primitives: Story = {
  render: () => (
    <div className="bg-background p-4">
      <LoadingRegion>
        <div className="space-y-4">
          <SkeletonToolbar />
          <SkeletonMetrics />
          <div className="grid gap-4 lg:grid-cols-2">
            <SkeletonChart />
            <SkeletonForm />
          </div>
          <SkeletonTable />
          <SkeletonPanel>
            <SkeletonList />
            <SkeletonText />
          </SkeletonPanel>
        </div>
      </LoadingRegion>
    </div>
  ),
};
