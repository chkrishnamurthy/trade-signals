import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicArticle, PublicList, PublicSection } from '@/components/layout/public-page';
import { GRIEVANCE_EMAIL } from '@/lib/legal';
import { SHARE_IMAGE, SITE_URL } from '@/lib/seo/schema';

const DESCRIPTION =
  'What EquityWise stores about you, why, who else handles it, how long it is kept, and how to delete it.';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: DESCRIPTION,
  alternates: { canonical: '/privacy' },
  openGraph: {
    title: 'Privacy policy — EquityWise',
    description: DESCRIPTION,
    url: `${SITE_URL}/privacy`,
    images: [SHARE_IMAGE],
  },
};

const STRONG = 'font-semibold text-foreground';
const LINK = 'font-semibold text-foreground underline underline-offset-4';

export default function PrivacyPage() {
  return (
    <PublicArticle
      path="/privacy"
      crumb="Privacy policy"
      title="Privacy policy"
      intro="EquityWise keeps only what it needs to run your account, and never sells or shares it for advertising."
      updated="October 2026"
    >
      <PublicSection title="What we store">
        <PublicList>
          <li>
            <strong className={STRONG}>Your account:</strong> your email address and, if you set
            one, a hash of your password (Argon2id — the password itself is never stored). If you
            sign in with Google we receive your Google account identifier, name, email address and
            profile picture. Any profile details or photo you add.
          </li>
          <li>
            <strong className={STRONG}>What you create:</strong> watchlists, notes on stocks, saved
            screens and table layouts, and the alert rules you set.
          </li>
          <li>
            <strong className={STRONG}>Your portfolio, if you use it:</strong> the shares, dates and
            amounts you type in or approve from an uploaded file. The file itself is read and
            discarded; only the rows you confirm are saved. Only you can see these entries — no
            staff screen shows them. Each weekday evening we check them to write notices for you
            (such as a dividend coming up or a large move); notices are deleted after six months. We
            count how often you open the page, upload a file or add an entry, without recording any
            of the contents.
          </li>
          <li>
            <strong className={STRONG}>Security records:</strong> each sign-in session and security
            event (a sign-in, a password change, a failed attempt) records the IP address and
            browser details it came from, so that misuse can be detected and investigated.
          </li>
        </PublicList>
      </PublicSection>

      <PublicSection title="Where it is kept, and who else handles it">
        <p className="m-0">
          Account data is stored on our own server, hosted by Hostinger, and we do not sell, rent or
          share it with advertisers or data brokers. Two other services handle a small part of it:
        </p>
        <PublicList>
          <li>
            <strong className={STRONG}>Email delivery (Resend):</strong> your email address and the
            message, to send sign-in emails, password resets and the alert emails you ask for.
          </li>
          <li>
            <strong className={STRONG}>Google:</strong> only if you choose to sign in with Google.
          </li>
        </PublicList>
        <p className="m-0">
          Market-data providers are asked for prices only; they are never told who you are or what
          you hold.
        </p>
      </PublicSection>

      <PublicSection title="Cookies and browser storage">
        <p className="m-0">
          One cookie keeps you signed in (HTTP-only, so page scripts cannot read it), and a
          short-lived one protects a Google sign-in while it is in progress. Your browser&rsquo;s
          local storage holds display preferences, such as light or dark theme. There are no
          advertising cookies, tracking pixels or third-party analytics.
        </p>
      </PublicSection>

      <PublicSection title="How long it is kept">
        <PublicList>
          <li>Account data and what you create: until you delete it or delete your account.</li>
          <li>Portfolio notices: six months.</li>
          <li>Expired sessions and sign-in links: removed automatically.</li>
          <li>
            Security records: kept after an account is deleted — with the account&rsquo;s internal
            number, IP address and browser details, but not its email address — so that misuse can
            still be investigated.
          </li>
          <li>
            Backups: the database is backed up nightly and the last 14 backups are kept, so deleted
            data can remain in a backup for up to about two weeks (and in the hosting
            provider&rsquo;s weekly server backup) before it is overwritten.
          </li>
        </PublicList>
      </PublicSection>

      <PublicSection title="Your choices">
        <PublicList>
          <li>
            <strong className={STRONG}>Correct or delete</strong> your profile, watchlists, alerts
            and portfolio entries at any time in the app.
          </li>
          <li>
            <strong className={STRONG}>Delete your account</strong> from your profile&rsquo;s
            security settings. This permanently deletes your account and everything you created —
            watchlists, notes, alerts, saved screens and portfolio.
          </li>
          <li>
            <strong className={STRONG}>Ask for a copy</strong> of the data we hold about you, or for
            help with any of the above, by writing to{' '}
            <a href={`mailto:${GRIEVANCE_EMAIL}`} className={LINK}>
              {GRIEVANCE_EMAIL}
            </a>
            . See{' '}
            <Link href="/contact" className={LINK}>
              Contact &amp; grievances
            </Link>{' '}
            for how we handle a request.
          </li>
        </PublicList>
      </PublicSection>
    </PublicArticle>
  );
}
