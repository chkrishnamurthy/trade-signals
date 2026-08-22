import { SignUp } from '@clerk/nextjs';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create account — Signal',
  description: 'Create a Signal account.',
};

/** Account creation. Same frame as sign-in, so the two read as one surface. */
export default function SignUpPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-12">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span
            className="grid size-9 place-items-center rounded-lg bg-primary font-semibold text-primary-foreground text-sm"
            aria-hidden
          >
            S
          </span>
          <h1 className="font-semibold text-base tracking-tight">Signal</h1>
          <p className="text-muted-foreground text-sm">NSE market analysis</p>
        </div>
        <SignUp fallbackRedirectUrl="/dashboard" />
      </div>
    </main>
  );
}
