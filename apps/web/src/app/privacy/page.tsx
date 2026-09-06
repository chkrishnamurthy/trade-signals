import Link from 'next/link';

export const metadata = { title: 'Privacy Policy — EquityWise' };

/**
 * Placeholder privacy policy. The full, lawyer-reviewed text is required before
 * public launch (see docs/planning/authentication-plan.md §23). It documents what
 * we store (email, hashed password, sessions, profile), that it lives only on our
 * own server, that Resend is the sole processor (email delivery), and the user's
 * rights to export and delete.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-semibold text-2xl tracking-tight text-foreground">Privacy Policy</h1>
      <p className="mt-4 text-muted-foreground text-sm">
        We store only what your account needs — your email, a securely hashed password, your
        sessions, and your profile — on our own server. We do not sell your data. Email delivery is
        handled by our transactional email provider; no other third party receives your personal
        data. You may request export or deletion of your data at any time.
      </p>
      <p className="mt-4 text-muted-foreground text-sm">
        This is a summary placeholder; the full policy will be published before public launch.
      </p>
      <Link href="/signup" className="mt-8 inline-block text-foreground text-sm hover:underline">
        ← Back
      </Link>
    </main>
  );
}
