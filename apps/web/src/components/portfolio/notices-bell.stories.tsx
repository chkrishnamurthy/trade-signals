import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import type { NoticeDto } from '@/lib/portfolio-types';
import { NoticesBell } from './notices-bell';

const NOTICES: NoticeDto[] = [
  {
    id: 1,
    kind: 'stock_move',
    noticeDate: '2026-11-16',
    data: {
      symbol: 'URJA',
      changeRatio: -0.05,
      closePaise: 815,
      valueChangePaise: -81_200,
      session: '2026-11-16',
    },
    createdAt: '2026-11-16T14:00:00.000Z',
    read: false,
  },
  {
    id: 2,
    kind: 'stock_move',
    noticeDate: '2026-11-16',
    data: {
      symbol: 'TMPV',
      changeRatio: -0.087,
      closePaise: 26_240,
      valueChangePaise: -4_35_000,
      session: '2026-11-16',
    },
    createdAt: '2026-11-16T14:00:00.000Z',
    read: false,
  },
  {
    id: 3,
    kind: 'event_soon',
    noticeDate: '2026-11-09',
    data: {
      symbol: 'HINDUNILVR',
      eventType: 'dividend',
      eventDate: '2026-11-12',
      daysAway: 3,
      dividendPaise: 1_900,
      shares: 22,
    },
    createdAt: '2026-11-09T14:00:00.000Z',
    read: true,
  },
];

/** Answers the two notices endpoints the bell calls. */
function mockNotices(notices: readonly NoticeDto[]) {
  return () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes('/notices/count')) {
        return Response.json({ unread: notices.filter((n) => !n.read).length });
      }
      return Response.json({ notices });
    };
    return () => {
      globalThis.fetch = original;
    };
  };
}

/**
 * The header bell and its panel: anchored under the bell from `sm`, a bottom
 * sheet on phones. Opening it does not mark anything read.
 */
const meta = {
  title: 'Features/Portfolio/NoticesBell',
  component: NoticesBell,
  parameters: { layout: 'centered', nextjs: { appDirectory: true } },
  beforeEach: mockNotices(NOTICES),
} satisfies Meta<typeof NoticesBell>;

export default meta;
type Story = StoryObj<typeof meta>;

const open = async (canvasElement: HTMLElement) => {
  await userEvent.click(
    await within(canvasElement).findByRole('button', { name: /Portfolio notices, 2 new/ }),
  );
  return within(canvasElement.ownerDocument.body);
};

export const Desktop: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
  play: async ({ canvasElement }) => {
    const body = await open(canvasElement);
    await expect(await body.findByText(/TMPV fell 8\.7%/)).toBeVisible();
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: 'mobile', isRotated: false } },
  play: async ({ canvasElement }) => {
    const body = await open(canvasElement);
    const sheet = await body.findByRole('dialog', { name: 'Portfolio notices' });
    await expect(await within(sheet).findByText(/URJA fell 5\.0%/)).toBeVisible();
  },
};

export const Empty: Story = {
  beforeEach: mockNotices([]),
  globals: { viewport: { value: 'mobile', isRotated: false } },
};
