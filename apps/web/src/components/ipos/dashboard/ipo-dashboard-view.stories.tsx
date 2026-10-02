import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DASHBOARD, FEEDS_OK } from '@/stories/fixtures/ipos';
import { IpoDashboardView } from './ipo-dashboard-view';

/**
 * The IPO dashboard (`/ipos`) with the real mainboard issues of 2 Oct 2026.
 * Check every story at Mobile (375) and Desktop (1440), in both themes.
 */
const meta = {
  title: 'IPOs/IpoDashboardView',
  component: IpoDashboardView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/ipos' } },
  },
  args: { data: DASHBOARD },
} satisfies Meta<typeof IpoDashboardView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Mobile: Story = {
  globals: { viewport: { value: 'mobile', isRotated: false } },
};

/** A quiet board: every module says plainly that it has nothing to show. */
export const NothingCurrent: Story = {
  args: {
    data: {
      ...DASHBOARD,
      counts: { upcoming: 0, open: 0, closed: 0, listed: 88, withdrawn: 0, postponed: 0 },
      awaitingListing: 0,
      current: [],
      subscription: [],
      gmp: [],
      agenda: [],
      allotment: [],
      documents: [],
    },
  },
};

/** The SME board: no SEBI module (SME drafts are filed with the exchange). */
export const Sme: Story = {
  args: { data: { ...DASHBOARD, board: 'sme', filings: [] } },
};

/** The GMP source switched off in YAML: no GMP module, no GMP note. */
export const GmpSourceOff: Story = {
  args: {
    data: {
      ...DASHBOARD,
      gmp: [],
      gmpTrack: null,
      gmpPolicy: { enabled: false, sourceName: null, sourceUrl: null },
    },
  },
};

/** A failed feed is named, with the reason — never a silent "stale". */
export const FeedFailed: Story = {
  args: {
    data: {
      ...DASHBOARD,
      feeds: [
        {
          ...FEEDS_OK[0],
          status: 'failed',
          error: 'SourceHttpError: 503',
        } as (typeof FEEDS_OK)[number],
        ...FEEDS_OK.slice(1),
      ],
    },
  },
};
