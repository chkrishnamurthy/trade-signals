import { withThemeByClassName } from '@storybook/addon-themes';
import type { Preview } from '@storybook/nextjs-vite';
import { Inter, JetBrains_Mono } from 'next/font/google';
// The single source of truth for tokens. Vite runs it through the app's own
// postcss.config.mjs (@tailwindcss/postcss), so every utility resolves exactly
// as it does in the app.
import '../src/app/globals.css';

// Mirror the app's font wiring (see app/layout.tsx) so `--font-inter` /
// `--font-mono-figures` — and therefore the `figure` tabular-figures utility —
// resolve to the real faces instead of the fallback stack.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-figures',
  display: 'swap',
});

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    // Report a11y findings in the panel. Hard-failing the run is wired in a
    // later phase, once the catalogue is clean (plan §8, Phase 6).
    a11y: { test: 'todo' },
    // Responsive is MANDATORY (see docs/design-system/contributing.md). Use the
    // Viewport toolbar to check every story at mobile and desktop; `desktop` is
    // the app's own `lg` breakpoint where the sidebar becomes permanent.
    viewport: {
      options: {
        mobile: { name: 'Mobile (375)', styles: { width: '375px', height: '812px' } },
        tablet: { name: 'Tablet (768)', styles: { width: '768px', height: '1024px' } },
        laptop: { name: 'Laptop (1024)', styles: { width: '1024px', height: '720px' } },
        desktop: { name: 'Desktop (1440)', styles: { width: '1440px', height: '900px' } },
      },
    },
  },
  decorators: [
    // Toggle the `.dark` class on <html>, exactly as `lib/theme.ts` does in the
    // app — so every story is verifiable in both themes from the toolbar.
    withThemeByClassName({
      themes: { light: '', dark: 'dark' },
      defaultTheme: 'light',
      parentSelector: 'html',
    }),
    (Story) => (
      <div className={`${inter.variable} ${mono.variable} font-sans text-foreground`}>
        <Story />
      </div>
    ),
  ],
};

export default preview;
