import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AONE, DETAIL_VNL, TODAY } from '@/stories/fixtures/ipos';
import { IpoDetailView } from './ipo-detail-view';

/**
 * One IPO in full. Vishal Nirmiti (open, 2 Oct 2026) with real NSE figures;
 * variants cover a listed issue, no GMP, and an RHP extraction.
 */
const meta = {
  title: 'IPOs/IpoDetailView',
  component: IpoDetailView,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: `/ipos/${DETAIL_VNL.slug}` } },
  },
  args: { ipo: DETAIL_VNL, today: TODAY },
} satisfies Meta<typeof IpoDetailView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Mobile: Story = {
  globals: { viewport: { value: 'mobile', isRotated: false } },
};

export const Listed: Story = {
  args: {
    ipo: {
      ...DETAIL_VNL,
      ...AONE,
      subscriptionHistory: [],
      timeline: DETAIL_VNL.timeline.map((e) => ({
        ...e,
        done: true,
        expected: e.kind === 'listing' ? false : e.expected,
      })),
      gmpTrackRecord: {
        ...DETAIL_VNL.gmpTrackRecord,
        thisIssue: DETAIL_VNL.gmpTrackRecord.rows[0] ?? null,
      },
    },
  },
};

/** The GMP source switched off: the panel explains why there is no figure. */
export const NoGmp: Story = {
  args: {
    ipo: {
      ...DETAIL_VNL,
      gmp: null,
      gmpPanel: { official: false, available: false, reason: 'source_disabled', sourceName: null },
    },
  },
};

/**
 * The RHP not read yet (or the extractor could not read it with confidence):
 * the section points at the document instead. `Open` shows the real VNL
 * extracts, quoted and cited by PDF page.
 */
export const RhpNotReadYet: Story = {
  args: { ipo: { ...DETAIL_VNL, rhp: [] } },
};
