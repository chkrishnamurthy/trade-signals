import { MailIcon, ShieldCheckIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { PublicArticle, PublicSection } from '@/components/layout/public-page';
import {
  GRIEVANCE_ACKNOWLEDGE_WITHIN,
  GRIEVANCE_EMAIL,
  GRIEVANCE_OFFICER,
  GRIEVANCE_RESOLVE_WITHIN,
  SEBI_SCORES_URL,
  SUPPORT_EMAIL,
} from '@/lib/legal';
import { SHARE_IMAGE, SITE_URL } from '@/lib/seo/schema';

const DESCRIPTION =
  'Contact EquityWise for help, to report a data problem, or to raise a grievance.';

export const metadata: Metadata = {
  title: 'Contact and grievances',
  description: DESCRIPTION,
  alternates: { canonical: '/contact' },
  openGraph: {
    title: 'Contact and grievances — EquityWise',
    description: DESCRIPTION,
    url: `${SITE_URL}/contact`,
    images: [SHARE_IMAGE],
  },
};

const MAIL =
  'font-semibold text-foreground underline underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring';

export default function ContactPage() {
  return (
    <PublicArticle
      path="/contact"
      crumb="Contact"
      title="Contact and grievances"
      intro="Write to us for help, to report a figure that looks wrong, or to raise a complaint."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
          <MailIcon className="size-5 text-primary-strong" aria-hidden />
          <h2 className="m-0 font-bold text-foreground text-lg">Help and data problems</h2>
          <p className="m-0 text-sm">
            Questions about your account, or a price, indicator or filing that looks wrong. Name the
            stock and the page you saw it on.
          </p>
          <a href={`mailto:${SUPPORT_EMAIL}`} className={MAIL}>
            {SUPPORT_EMAIL}
          </a>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
          <ShieldCheckIcon className="size-5 text-primary-strong" aria-hidden />
          <h2 className="m-0 font-bold text-foreground text-lg">Grievances and privacy</h2>
          <p className="m-0 text-sm">
            A complaint about the service, how your data is handled, or a request to see or delete
            your data.
          </p>
          <a href={`mailto:${GRIEVANCE_EMAIL}`} className={MAIL}>
            {GRIEVANCE_EMAIL}
          </a>
        </div>
      </div>

      <PublicSection title="Grievance Officer" id="grievance">
        <p className="m-0">
          If something is wrong with your account, your data, or how we handled a request, write to
          our Grievance Officer. Include the email address on your account and what happened, so we
          can find it.
        </p>
        <dl className="m-0 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
          <dt>Designation</dt>
          <dd className="m-0 font-medium text-foreground">{GRIEVANCE_OFFICER.designation}</dd>
          {GRIEVANCE_OFFICER.name !== null && (
            <>
              <dt>Name</dt>
              <dd className="m-0 font-medium text-foreground">{GRIEVANCE_OFFICER.name}</dd>
            </>
          )}
          <dt>Email</dt>
          <dd className="m-0">
            <a href={`mailto:${GRIEVANCE_EMAIL}`} className={MAIL}>
              {GRIEVANCE_EMAIL}
            </a>
          </dd>
          {GRIEVANCE_OFFICER.postalAddress !== null && (
            <>
              <dt>Postal address</dt>
              <dd className="m-0 font-medium text-foreground">{GRIEVANCE_OFFICER.postalAddress}</dd>
            </>
          )}
          <dt>What to expect</dt>
          <dd className="m-0 text-foreground">
            We acknowledge a grievance within {GRIEVANCE_ACKNOWLEDGE_WITHIN} and aim to resolve it
            within {GRIEVANCE_RESOLVE_WITHIN}. If it will take longer, we tell you why.
          </dd>
        </dl>
        <p className="m-0 text-sm">
          EquityWise is not registered with SEBI as an investment adviser, research analyst or
          broker, so a complaint about this service cannot be filed on SEBI&rsquo;s SCORES portal.
          SCORES takes complaints about listed companies and SEBI-registered intermediaries such as
          your broker, and is the place to go for those:{' '}
          <a href={SEBI_SCORES_URL} target="_blank" rel="noopener noreferrer" className={MAIL}>
            scores.sebi.gov.in
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          .
        </p>
      </PublicSection>
    </PublicArticle>
  );
}
