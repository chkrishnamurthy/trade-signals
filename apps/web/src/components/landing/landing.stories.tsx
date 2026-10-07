import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor } from 'storybook/test';
import { PublicFrame } from '@/components/layout/public-page';
import { SessionProvider } from '@/lib/use-session';
import { MobileCtaBar } from './mobile-cta-bar';
import { ProductTour } from './product-tour';
import {
  Audiences,
  ClosingCta,
  Faq,
  Features,
  Hero,
  HowItWorks,
  Stance,
  TrustAndSafety,
} from './sections';

/**
 * The signed-out landing page, assembled as `app/page.tsx` assembles it
 * (that page also redirects signed-in users to the Market brief).
 */
function LandingPage({ signupOpen = true }: { signupOpen?: boolean }) {
  return (
    <SessionProvider initial={{ status: 'signed-out' }} signupOpen={signupOpen}>
      <PublicFrame>
        <Hero />
        <Stance />
        <Features />
        <ProductTour />
        <HowItWorks />
        <Audiences />
        <TrustAndSafety />
        <Faq />
        <ClosingCta />
        <MobileCtaBar />
      </PublicFrame>
    </SessionProvider>
  );
}

const meta = {
  title: 'Pages/Landing',
  component: LandingPage,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/' } },
  },
} satisfies Meta<typeof LandingPage>;

export default meta;
type Story = StoryObj<typeof meta>;

const noSidewaysScroll = async () => {
  await waitFor(() => {
    const root = document.documentElement;
    expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  });
};

export const Desktop: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
  play: noSidewaysScroll,
};

export const Mobile: Story = {
  globals: { viewport: { value: 'mobile', isRotated: false } },
  play: noSidewaysScroll,
};

/** Self-service sign-up switched off: every call to action becomes "Sign in". */
export const SignupClosed: Story = {
  args: { signupOpen: false },
  globals: { viewport: { value: 'desktop', isRotated: false } },
  play: async () => {
    await waitFor(() => {
      expect(document.querySelector('a[href="/signup"]')).toBeNull();
    });
  },
};
