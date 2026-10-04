import type { Metadata } from 'next';
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { JsonLd } from '@/components/seo/json-ld';
import { ToastProvider } from '@/components/ui/toast';
import { NAV_INIT_SCRIPT } from '@/lib/nav-rail';
import {
  generateOrganizationAndWebsiteSchema,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from '@/lib/seo/schema';
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

/**
 * Display face for headings and the wordmark. Bricolage Grotesque gives the
 * marketing and product surfaces a warmer, more editorial voice than the
 * interface sans — used only for headings, so data columns keep Inter's
 * tabular figures.
 */
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  weight: ['600', '700', '800'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — NSE Stock Analysis, Technical Indicators & Screener`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    'NSE stocks',
    'stock screener India',
    'share price today',
    'technical analysis',
    'RSI',
    'moving averages',
    '52 week high',
    'Indian equities',
    'EquityWise',
  ],
  authors: [{ name: 'EquityWise' }],
  creator: 'EquityWise',
  publisher: 'EquityWise',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — NSE Stock Analysis & Technical Screener`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — NSE Stock Analysis & Technical Screener`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const globalSchema = generateOrganizationAndWebsiteSchema();

  return (
    // The theme and navigation scripts write to <html> before React sees the
    // document, so the server markup and the hydrated markup differ here by
    // design.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable} ${bricolage.variable}`}
    >
      <head>
        {/* Organization and WebSite structured data for Google Rich Results */}
        <JsonLd schema={globalSchema} />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a blocking
            inline script is the only way to set the theme before first paint;
            the content is a module constant, never user input. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: same reason —
            the navigation rail's width has to be right on the first frame, or
            every page load shows the panel snapping shut after hydration. */}
        <script dangerouslySetInnerHTML={{ __html: NAV_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-background text-foreground" suppressHydrationWarning>
        {/* No auth gate at present — every route is open. A future login system
            wraps {children} here for client context, and adds
            apps/web/src/middleware.ts (Next.js convention) to gate routes. */}
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
