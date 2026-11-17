import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { SessionProvider } from '@/lib/use-session';
import { UserMenu } from './user-menu';

const USER = {
  email: 'krishna@example.com',
  role: 'user' as const,
  profile: { displayName: 'Krishna Murthy', avatarUrl: null },
};

/**
 * The account control. A dropdown under the avatar from `sm`; a bottom sheet
 * with flat, touch-height rows on phones. Same entries in both.
 */
const meta = {
  title: 'Features/Account/UserMenu',
  component: UserMenu,
  parameters: { layout: 'centered', nextjs: { appDirectory: true } },
  decorators: [
    (Story) => (
      <SessionProvider initial={{ status: 'signed-in', user: USER }}>
        <Story />
      </SessionProvider>
    ),
  ],
  beforeEach: () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ user: USER });
    return () => {
      globalThis.fetch = original;
    };
  },
} satisfies Meta<typeof UserMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

const openMenu = async (canvasElement: HTMLElement) => {
  await userEvent.click(
    within(canvasElement).getByRole('button', { name: /Account menu for Krishna Murthy/ }),
  );
};

export const Desktop: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
  play: async ({ canvasElement }) => {
    await openMenu(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole('menuitem', { name: /Methodology/ })).toBeVisible();
  },
};

/** Phone: a sheet across the bottom, every row at least 44px tall. */
export const Mobile: Story = {
  globals: { viewport: { value: 'mobile', isRotated: false } },
  play: async ({ canvasElement }) => {
    await openMenu(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const sheet = await body.findByRole('dialog', { name: 'Krishna Murthy' });
    await waitFor(() => {
      const box = sheet.getBoundingClientRect();
      expect(Math.round(box.width)).toBe(window.innerWidth);
      expect(Math.round(box.bottom)).toBeLessThanOrEqual(window.innerHeight);
    });
    for (const row of sheet.querySelectorAll('[data-slot="panel-item"]')) {
      expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(36);
    }
  },
};
