import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'NSE Signal Platform',
  description: 'BUY/SELL/HOLD signals for NSE equities, intraday and swing.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme script adds a class to <html> before React sees the document,
    // so the server markup and the hydrated markup differ here by design.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a blocking
            inline script is the only way to set the theme before first paint;
            the content is a module constant, never user input. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-white text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
