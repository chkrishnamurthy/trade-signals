/**
 * Facts the legal and contact pages state about who answers for the service.
 *
 * Kept in one place so the owner edits a value, not page markup. Nothing here
 * has been through legal review; the response windows in particular are
 * commitments made in public and must be confirmed by whoever reviews the terms.
 */

export const SUPPORT_EMAIL = 'support@equitywise.io';
export const GRIEVANCE_EMAIL = 'compliance@equitywise.io';

/**
 * The named person who answers grievances. `name` and `postalAddress` are left
 * null on purpose: they must be the real person and a real address, supplied by
 * the owner, and the contact page shows each line only once it is filled in.
 * Set them here — nothing else needs to change.
 */
export const GRIEVANCE_OFFICER: {
  readonly designation: string;
  readonly name: string | null;
  readonly postalAddress: string | null;
} = {
  designation: 'Grievance Officer, EquityWise',
  name: null,
  postalAddress: null,
};

/** Public commitments. Confirm against the lawyer's advice before relying on them. */
export const GRIEVANCE_ACKNOWLEDGE_WITHIN = '2 business days';
export const GRIEVANCE_RESOLVE_WITHIN = '30 days';

/** SEBI's complaint portal. It covers listed companies and SEBI-registered intermediaries. */
export const SEBI_SCORES_URL = 'https://scores.sebi.gov.in';
