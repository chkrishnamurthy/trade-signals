import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DASHBOARD, FEEDS_OK } from '@/stories/fixtures/ipos';
import { IpoDashboardView } from './ipo-dashboard-view';

/**
 * The IPO Overview (`/ipos`) with the real mainboard issues of 2 Oct 2026.
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
      yearCounts: { upcoming: 0, open: 0, closed: 0, listed: 88, withdrawn: 0, postponed: 0 },
      awaitingListing: 0,
      open: [],
      upcoming: [],
      gmp: [],
      agenda: [],
      allotment: [],
    },
  },
};

/** Both boards: SME issues carry a mark wherever they appear. */
export const AllBoards: Story = {
  args: { data: { ...DASHBOARD, board: 'all' } },
};

/** The SME board: no SEBI count (SME drafts are filed with the exchange). */
export const Sme: Story = {
  args: { data: { ...DASHBOARD, board: 'sme', filedRecently: null } },
};

/** The GMP source switched off in YAML: no GMP module, no GMP note. */
export const GmpSourceOff: Story = {
  args: {
    data: {
      ...DASHBOARD,
      gmp: [],
      gmpTracks: [],
      gmpPolicy: { enabled: false, sourceName: null, sourceUrl: null, trackedSince: null },
    },
  },
};

/** A failed RHP run is for /admin/ipos: what was read stays correct, so readers see no alert. */
export const RhpFeedFailed: Story = {
  args: {
    data: {
      ...DASHBOARD,
      feeds: [
        ...FEEDS_OK,
        {
          id: 'ipo-nse-rhp',
          label: 'NSE RHP extracts',
          status: 'failed',
          lastSuccessAt: '2026-10-02T05:50:00.000Z',
          lastAttemptAt: '2026-10-02T12:50:00.000Z',
          error: 'Error: 1 of 1 RHP(s) could not be read',
        },
      ],
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
