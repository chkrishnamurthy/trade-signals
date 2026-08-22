import { ClerkProvider } from '@clerk/nextjs';
import { shadcn } from '@clerk/ui/themes';
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import type { ComponentProps, ReactNode } from 'react';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import './globals.css';

/**
 * Typefaces.
 *
 * Inter for the interface and JetBrains Mono for technical readings. Both are
 * loaded as CSS variables, which `globals.css` maps onto `--font-sans` and
 * `--font-mono` — so the font is a token like every other design decision.
 *
 * Inter is chosen for its tabular figures: a column of prices only aligns if
 * every digit is the same width, and that is a property of the face.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-figures',
  display: 'swap',
});

type ClerkAppearance = NonNullable<ComponentProps<typeof ClerkProvider>['appearance']>;

/**
 * Clerk, wearing this application's tokens.
 *
 * The shadcn theme already reads the shadcn registry variable names that
 * `globals.css` publishes, so most of the palette arrives for free — including
 * the dark ramp, because those variables are redefined under `.dark`. The three
 * overrides below map the two surface tokens this product renamed
 * (`--card` -> `--surface`). No colour is declared here, only redirected.
 *
 * The cast exists because Clerk ships the theme's type from a second copy of
 * its own definitions, and the two differ only in whether `cssLayerName` may be
 * `undefined` — a variance this workspace's `exactOptionalPropertyTypes` sees
 * and TypeScript cannot reconcile across the package boundary.
 */
const CLERK_APPEARANCE: ClerkAppearance = {
  theme: shadcn as NonNullable<ClerkAppearance['theme']>,
  variables: {
    colorBackground: 'var(--surface)',
    colorForeground: 'var(--foreground)',
    colorInputForeground: 'var(--foreground)',
  },
};

export const metadata: Metadata = {
  title: 'WealthOS — NSE market analysis',
  description: 'Track, screen and analyse NSE equities. Technical decision support, not execution.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme script adds a class to <html> before React sees the document,
    // so the server markup and the hydrated markup differ here by design.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a blocking
            inline script is the only way to set the theme before first paint;
            the content is a module constant, never user input. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-background text-foreground">
        {/* Every route is behind the gate; only /sign-in and /sign-up are open. */}
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          afterSignOutUrl="/sign-in"
          appearance={CLERK_APPEARANCE}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
