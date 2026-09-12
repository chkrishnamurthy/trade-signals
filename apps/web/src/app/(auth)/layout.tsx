import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

/** Centered shell for the sign-in / sign-up / verify / reset pages. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      {children}
    </div>
  );
}
