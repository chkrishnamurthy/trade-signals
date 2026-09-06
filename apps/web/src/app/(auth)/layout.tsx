import type { ReactNode } from 'react';

/** Centered shell for the sign-in / sign-up / verify / reset pages. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="grid min-h-dvh place-items-center bg-background px-6 py-10">{children}</div>;
}
