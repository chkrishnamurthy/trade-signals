import type { IpoSubscriptionCategory } from '@equitywise/shared';
import { nameTokens } from './match.js';

/**
 * Small, pure lookups shared by every IPO source: investor-category labels,
 * URL slugs, and the allowlist that keeps a source's links pointing where they
 * claim to.
 */

/**
 * The category an exchange's subscription label refers to. Order matters: the
 * bNII/sNII sub-buckets must be recognised before the general NII bucket.
 * Unknown labels are `other` and keep their verbatim label beside them.
 */
export function classifySubscriptionLabel(label: string): IpoSubscriptionCategory {
  const text = label.toLowerCase().replace(/\s+/g, ' ').trim();
  if (text === 'total') return 'total';
  if (/qualified institutional|\bqib/.test(text)) return 'qib';
  if (/non[- ]institutional|\bnii\b|\bhni\b/.test(text)) {
    if (/more than ten lakh|more than 10 lakh|above (?:rs\.? )?10 lakh|\bbnii\b/.test(text))
      return 'nii_big';
    if (/(?:two|2) lakh.*(?:ten|10) lakh|\bsnii\b/.test(text)) return 'nii_small';
    return 'nii';
  }
  if (/retail individual|\brii\b|individual investors? \(ind/.test(text)) return 'retail';
  if (/employee/.test(text)) return 'employee';
  if (/shareholder/.test(text)) return 'shareholder';
  if (/policy ?holder/.test(text)) return 'policyholder';
  return 'other';
}

/**
 * `Vishal Nirmiti Limited`, 2026 → `vishal-nirmiti-ipo-2026`; a collision gets
 * `-2`, `-3`, …. Legal-form words are dropped by `nameTokens`.
 */
export function slugFor(companyName: string, year: number, taken: ReadonlySet<string>): string {
  const stem = nameTokens(companyName).join('-').slice(0, 80).replace(/-+$/, '') || 'issue';
  const base = `${stem}-ipo-${year}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * True when `url` is https (or http) on one of `hosts` or a subdomain of one.
 * Every link a source hands us passes this before it is stored or rendered.
 */
export function isAllowedHost(url: string, hosts: readonly string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  const host = parsed.hostname.toLowerCase();
  return hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}
