import { SignUp } from '@clerk/nextjs';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create account — EquityWise',
  description: 'Create a EquityWise account.',
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
            W
          </span>
          <h1 className="font-semibold text-base tracking-tight">EquityWise</h1>
          <p className="text-muted-foreground text-sm">Create your account</p>
        </div>
        <SignUp fallbackRedirectUrl="/watchlists" />
      </div>
    </main>
  );
}
