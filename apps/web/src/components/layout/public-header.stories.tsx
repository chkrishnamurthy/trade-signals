import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor, within } from 'storybook/test';
import { SessionProvider, type SessionState } from '@/lib/use-session';
import { PublicHeader } from './public-header';

/**
 * The public header in its three states (plan §4.1–4.2). The session comes
 * from the server in the app; here it is handed in directly.
 */
function Header({ session, signupOpen }: { session: SessionState; signupOpen: boolean }) {
  return (
    <SessionProvider initial={session} signupOpen={signupOpen}>
      <PublicHeader />
      <div id="main-content" className="h-40" />
    </SessionProvider>
  );
}

const meta = {
  title: 'Layout/PublicHeader',
  component: Header,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/about' } },
  },
  args: { session: { status: 'signed-out' }, signupOpen: true },
} satisfies Meta<typeof Header>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedOut: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByRole('link', { name: 'Create free account' })).toBeVisible(),
    );
    await expect(canvas.getByRole('link', { name: 'Features' })).toBeVisible();
  },
};

export const SignedIn: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
  args: {
    session: {
      status: 'signed-in',
      user: {
        email: 'tester@example.com',
        role: 'user',
        profile: { displayName: 'Test User', avatarUrl: null },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByRole('link', { name: 'Open Market brief' })).toBeVisible(),
    );
    // The landing's sections are not offered: `/` sends members to the app.
    await expect(canvas.queryByRole('link', { name: 'Features' })).toBeNull();
    await expect(canvas.queryByRole('link', { name: 'Create free account' })).toBeNull();
  },
};

export const SignupClosed: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
  args: { signupOpen: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole('link', { name: 'Sign in' })).toBeVisible());
    await expect(canvas.queryByRole('link', { name: 'Create free account' })).toBeNull();
  },
};

export const Phone: Story = {
  globals: { viewport: { value: 'mobile', isRotated: false } },
};
