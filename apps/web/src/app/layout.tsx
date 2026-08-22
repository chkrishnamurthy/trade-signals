import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
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

export const metadata: Metadata = {
  title: 'Signal — NSE market analysis',
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
      <body className="min-h-dvh bg-background text-foreground">{children}</body>
    </html>
  );
}
