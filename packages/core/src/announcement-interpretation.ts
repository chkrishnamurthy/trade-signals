/** Pure, conservative interpretation of exchange metadata. Attachments are not read. */
export const ANNOUNCEMENT_METHOD = 'metadata-rules-v1';

export const ANNOUNCEMENT_CATEGORIES = {
  FINANCIAL_RESULTS: 'Financial results',
  DIVIDEND: 'Dividend',
  BONUS_ISSUE: 'Bonus issue',
  STOCK_SPLIT: 'Stock split',
  BUYBACK: 'Buyback',
  RIGHTS_ISSUE: 'Rights issue',
  FUNDRAISING: 'Fundraising',
  ORDER_WIN: 'Order win',
  ORDER_UPDATE: 'Order update',
  ACQUISITION: 'Acquisition',
  DIVESTMENT: 'Divestment',
  MERGER: 'Merger',
  CAPEX: 'Capital expenditure',
  CREDIT_RATING: 'Credit rating',
  MANAGEMENT_CHANGE: 'Management change',
  BOARD_MEETING: 'Board meeting',
  SHAREHOLDER_MEETING: 'Shareholder meeting',
  REGULATORY_LEGAL: 'Regulatory / legal',
  RELATED_PARTY_TRANSACTION: 'Related-party transaction',
  SHAREHOLDING: 'Shareholding',
  INVESTOR_PRESENTATION: 'Investor presentation',
  CLARIFICATION: 'Clarification',
  CORRECTION: 'Correction',
  CANCELLATION: 'Cancellation',
  OTHER: 'Other',
} as const;
export type AnnouncementCategory = keyof typeof ANNOUNCEMENT_CATEGORIES;
export const ANNOUNCEMENT_STATUSES = {
  ANNOUNCED: 'Announced',
  PROPOSED: 'Proposed',
  BOARD_APPROVED: 'Board approved',
  SHAREHOLDER_APPROVAL_PENDING: 'Shareholder approval pending',
  REGULATORY_APPROVAL_PENDING: 'Regulatory approval pending',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  DELAYED: 'Delayed',
  WITHDRAWN: 'Withdrawn',
  CANCELLED: 'Cancelled',
  CORRECTED: 'Corrected',
  STATUS_UNKNOWN: 'Status not established',
} as const;
export type AnnouncementEventStatus = keyof typeof ANNOUNCEMENT_STATUSES;
export interface AnnouncementText {
  readonly headline: string;
  readonly detail: string | null;
  readonly category: string | null;
}
export interface AnnouncementEvidence {
  readonly field: 'headline' | 'detail' | 'category';
  readonly start: number;
  readonly end: number;
  readonly excerpt: string;
}
export interface AnnouncementFact {
  readonly label: string;
  /** Verbatim text, including original monetary units. Not a numeric money value. */
  readonly value: string;
  readonly evidence: AnnouncementEvidence;
}
export interface AnnouncementInterpretation {
  readonly method: typeof ANNOUNCEMENT_METHOD;
  readonly scope: 'metadata_only';
  readonly category: AnnouncementCategory;
  readonly categoryEvidence: AnnouncementEvidence | null;
  readonly eventStatus: AnnouncementEventStatus;
  readonly statusEvidence: AnnouncementEvidence | null;
  readonly summary: string;
  readonly facts: readonly AnnouncementFact[];
  readonly importantDates: readonly AnnouncementFact[];
  readonly relevance: readonly {
    area: string;
    explanation: string;
    evidence: AnnouncementEvidence;
  }[];
  readonly unknowns: readonly string[];
  readonly warnings: readonly string[];
}

const RULES: readonly [AnnouncementCategory, RegExp][] = [
  ['CORRECTION', /\b(corrigendum|correction|revised disclosure)\b/i],
  ['CANCELLATION', /\b(cancellation|cancelled|withdrawn)\b/i],
  ['CLARIFICATION', /\bclarification\b/i],
  [
    'REGULATORY_LEGAL',
    /\b(show.cause|legal|litigation|court|tribunal|regulatory action|penalty|allegation|investigation)\b/i,
  ],
  [
    'SHAREHOLDER_MEETING',
    /\b(annual general meeting|extraordinary general meeting|agm|egm|postal ballot)\b/i,
  ],
  ['BOARD_MEETING', /\bboard meeting\b/i],
  ['RELATED_PARTY_TRANSACTION', /\brelated.party transactions?\b/i],
  [
    'FINANCIAL_RESULTS',
    /\b(financial results|quarterly results|annual results|financial statements|results)\b/i,
  ],
  ['DIVIDEND', /\bdividend\b/i],
  ['BONUS_ISSUE', /\bbonus (issue|shares)\b/i],
  ['STOCK_SPLIT', /\b(stock split|sub.division|subdivision)\b/i],
  ['BUYBACK', /\bbuy.?back\b/i],
  ['RIGHTS_ISSUE', /\brights issue\b/i],
  ['FUNDRAISING', /\b(fund.?raising|preferential issue|qualified institutions? placement|qip)\b/i],
  ['ORDER_UPDATE', /\b(order amendment|order update|contract amendment)\b/i],
  [
    'ORDER_WIN',
    /\b(order win|order received|receipt of (an? )?(purchase |work )?order|contract awarded|award of (a )?contract|secured (an? )?(purchase |work )?order)\b/i,
  ],
  ['ACQUISITION', /\bacquisition\b/i],
  ['DIVESTMENT', /\b(divestment|divestiture|disinvestment)\b/i],
  ['MERGER', /\b(merger|amalgamation)\b/i],
  ['CAPEX', /\b(capex|capital expenditure|capacity expansion)\b/i],
  ['CREDIT_RATING', /\b(credit rating|rating reaffirmed|rating upgrade|rating downgrade)\b/i],
  ['MANAGEMENT_CHANGE', /\b(appointment|resignation|cessation)\b/i],
  ['SHAREHOLDING', /\bshareholding\b/i],
  ['INVESTOR_PRESENTATION', /\b(investor presentation|analyst presentation)\b/i],
];

const CONTEXT: Partial<Record<AnnouncementCategory, readonly [string, string, string]>> = {
  FINANCIAL_RESULTS: [
    'Earnings',
    'The filing relates to reported financial performance.',
    'Comparable periods, accounting basis, audit status and financial definitions have not been verified.',
  ],
  DIVIDEND: [
    'Shareholder entitlement',
    'The filing relates to a possible shareholder cash entitlement; approval and eligibility dates matter.',
    'Dividend amount, approval, record date, ex-date and payment date require verification.',
  ],
  BONUS_ISSUE: [
    'Shareholder entitlement',
    'The filing relates to bonus shares; the ratio and eligibility conditions matter.',
    'Bonus ratio, approvals and eligibility dates require verification.',
  ],
  STOCK_SPLIT: [
    'Shareholder entitlement',
    'The filing relates to a change in the denomination of shares.',
    'Split ratio, face value and authoritative action dates require verification.',
  ],
  BUYBACK: [
    'Capital allocation',
    'The filing relates to a potential return of capital through a buyback.',
    'Offer terms, approvals and completion have not been verified.',
  ],
  RIGHTS_ISSUE: [
    'Ownership / dilution',
    'The filing relates to a rights issue; participation and issue terms affect ownership.',
    'Dilution cannot be calculated without valid share counts and issue terms.',
  ],
  FUNDRAISING: [
    'Ownership / dilution',
    'The filing relates to raising capital; the instrument and terms determine its effect.',
    'Funding terms, approval status and potential dilution have not been verified.',
  ],
  ORDER_WIN: [
    'Revenue / order book',
    'The filing may relate to future order-book activity. Disclosed order value is not current revenue or profit.',
    'Revenue recognition, profitability and execution conditions cannot be determined from an order value alone.',
  ],
  ORDER_UPDATE: [
    'Revenue / order book',
    'The filing relates to a change in previously disclosed order or contract terms.',
    'The earlier contract, changed terms and financial effect require verification.',
  ],
  ACQUISITION: [
    'Capital allocation',
    'The filing relates to acquiring an interest or business; completion may depend on approvals.',
    'Consideration, funding, approvals and completion have not been independently established.',
  ],
  DIVESTMENT: [
    'Capital allocation',
    'The filing relates to disposing of an interest or business.',
    'Consideration, approvals and completion require verification.',
  ],
  MERGER: [
    'Ownership / dilution',
    'The filing relates to a proposed or ongoing business combination.',
    'Exchange ratio, approvals, timetable and completion require verification.',
  ],
  CAPEX: [
    'Capital expenditure',
    'The filing relates to spending on or expanding operating capacity.',
    'Funding, commissioning date and financial effect have not been verified.',
  ],
  CREDIT_RATING: [
    'Debt',
    'The filing relates to an assessment of a debt instrument or issuer by a rating agency.',
    'Instrument, prior/new rating, outlook and agency rationale require verification.',
  ],
  MANAGEMENT_CHANGE: [
    'Management',
    'The filing relates to a management or governance role.',
    'Role, effective date, reason and required approvals require verification.',
  ],
  BOARD_MEETING: [
    'Governance',
    'A board meeting notice or outcome may contain matters for consideration. A scheduled meeting is not an approval.',
    'The agenda, decisions and any further approvals require verification.',
  ],
  SHAREHOLDER_MEETING: [
    'Governance',
    'The filing relates to shareholder consideration of company matters.',
    'Voting outcome, resolution scope and further approvals require verification.',
  ],
  REGULATORY_LEGAL: [
    'Regulatory / legal',
    'The filing relates to a legal or regulatory matter. A notice, allegation or investigation is not a final finding.',
    'Procedural stage, appeal status and ultimate financial effect require verification.',
  ],
  RELATED_PARTY_TRANSACTION: [
    'Governance',
    'The filing relates to a transaction involving a related party.',
    'Terms, relationship, approvals and financial effect require verification.',
  ],
  SHAREHOLDING: [
    'Ownership',
    'The filing describes ownership information for its stated reporting date, not live activity.',
    'Reporting date, holders and changes have not been verified.',
  ],
  INVESTOR_PRESENTATION: [
    'Operational update',
    'The filing contains company-provided investor information; forward-looking statements remain conditional.',
    'Assumptions and reported versus projected figures require verification.',
  ],
  CORRECTION: [
    'Disclosure update',
    'This filing identifies a correction; previous facts may have changed.',
    'The precise earlier filing and corrected values require verification; no automatic cross-filing link is asserted.',
  ],
  CANCELLATION: [
    'Disclosure update',
    'This filing relates to a cancellation or withdrawal.',
    'The affected event and scope of the cancellation require verification.',
  ],
  CLARIFICATION: [
    'Disclosure update',
    'This filing provides a clarification of a company matter.',
    'The earlier statement and any changed facts require verification.',
  ],
};

const LABELS = [
  'Reporting period',
  'Standalone/consolidated',
  'Audited/unaudited',
  'Revenue',
  'Operating profit',
  'Net profit',
  'EPS',
  'Exceptional items',
  'Order value',
  'Customer',
  'Geography',
  'Business segment',
  'Execution period',
  'Scope',
  'Tax treatment',
  'Related-party status',
  'Dividend per share',
  'Dividend type',
  'Face value',
  'Target',
  'Stake percentage',
  'Consideration',
  'Funding source',
  'Approvals required',
  'Company-stated purpose',
  'Maximum proposed amount',
  'Instrument',
  'Intended use',
  'Issue price',
  'Rating agency',
  'Previous rating',
  'New rating',
  'Outlook',
  'Person',
  'Role',
  'Reason',
  'Authority',
  'Nature of matter',
  'Amount involved',
  'Procedural stage',
  'Company response',
  'Appeal status',
] as const;
const DATE_LABELS = [
  'Record date',
  'Ex-date',
  'Payment date',
  'Effective date',
  'Expected completion',
  'Meeting date',
] as const;

function evidence(
  field: AnnouncementEvidence['field'],
  text: string,
  start: number,
  end: number,
): AnnouncementEvidence {
  return { field, start, end, excerpt: text.slice(start, end) };
}

/** Only explicit label/value lines are extracted. Prose amounts are deliberately not guessed. */
function labelledFacts(input: AnnouncementText, labels: readonly string[]): AnnouncementFact[] {
  const facts: AnnouncementFact[] = [];
  for (const field of ['headline', 'detail'] as const) {
    const text = input[field] ?? '';
    for (const match of text.matchAll(/(?:^|\n)([^\n:]{1,50}):[ \t]*([^\n]+)/g)) {
      const label = labels.find(
        (candidate) => candidate.toLowerCase() === match[1]?.trim().toLowerCase(),
      );
      const value = match[2]?.trim();
      if (label === undefined || value === undefined || value === '') continue;
      const start = match.index + (match[0].startsWith('\n') ? 1 : 0);
      facts.push({
        label,
        value,
        evidence: evidence(field, text, start, match.index + match[0].length),
      });
    }
  }
  return facts;
}

export function interpretAnnouncement(input: AnnouncementText): AnnouncementInterpretation {
  let category: AnnouncementCategory = 'OTHER';
  let categoryEvidence: AnnouncementEvidence | null = null;
  // Classify from title/category only: incidental words inside long detail text are unsafe.
  for (const [candidate, pattern] of RULES) {
    for (const field of ['headline', 'category'] as const) {
      const text = input[field] ?? '';
      const match = pattern.exec(text);
      if (match !== null) {
        category = candidate;
        categoryEvidence = evidence(field, text, 0, text.length);
        break;
      }
    }
    if (categoryEvidence !== null) break;
  }
  // A status is emitted only for an explicit, unambiguous labelled status.
  // Dates, category keywords, notices and expected completion never imply completion.
  const statuses = labelledFacts(input, ['Event status']);
  const found = statuses.map((fact) => ({
    fact,
    key: Object.entries(ANNOUNCEMENT_STATUSES).find(
      ([, label]) => label.toLowerCase() === fact.value.toLowerCase(),
    )?.[0] as AnnouncementEventStatus | undefined,
  }));
  const unique = new Set(found.map((entry) => entry.key));
  const explicit =
    unique.size === 1 && found.every((entry) => entry.key !== undefined) ? found[0] : undefined;
  const completionConflict =
    explicit?.key === 'COMPLETED' &&
    /\b(not completed|not yet completed|subject to|approval pending|expected to complete|proposed completion)\b/i.test(
      `${input.headline}\n${input.detail ?? ''}`,
    );
  const eventStatus = completionConflict ? 'STATUS_UNKNOWN' : (explicit?.key ?? 'STATUS_UNKNOWN');
  const context = CONTEXT[category];
  return {
    method: ANNOUNCEMENT_METHOD,
    scope: 'metadata_only',
    category,
    categoryEvidence,
    eventStatus,
    statusEvidence: eventStatus === 'STATUS_UNKNOWN' ? null : (explicit?.fact.evidence ?? null),
    summary:
      category === 'OTHER'
        ? 'The company published a disclosure. Read the original filing for its scope.'
        : `The filing relates to ${ANNOUNCEMENT_CATEGORIES[category].toLowerCase()}.`,
    facts: labelledFacts(input, LABELS),
    importantDates: labelledFacts(input, DATE_LABELS),
    relevance:
      context !== undefined && categoryEvidence !== null
        ? [{ area: context[0], explanation: context[1], evidence: categoryEvidence }]
        : [],
    unknowns: [
      'Only exchange-supplied title, category and description were analysed. The attachment has not been analysed; missing fields may be present there.',
      ...(context === undefined
        ? ['The event category and financial effect have not been established.']
        : [context[2]]),
      ...(eventStatus === 'STATUS_UNKNOWN'
        ? [
            'The current event status is not established by an unambiguous labelled status in the available text.',
          ]
        : []),
    ],
    warnings: [
      'Extracted values are verbatim source text, not independently verified or normalized financial figures.',
      'No financial-period comparisons or stock-price impact predictions are made.',
    ],
  };
}

/** Only link known official exchange hosts; never render an arbitrary provider URI. */
export function officialAnnouncementUrl(value: string | null): string | null {
  if (value === null) return null;
  try {
    const url = new URL(value);
    const allowed = [
      'www.bseindia.com',
      'bseindia.com',
      'www.nseindia.com',
      'nseindia.com',
      'archives.nseindia.com',
      'nsearchives.nseindia.com',
    ];
    return url.protocol === 'https:' &&
      allowed.includes(url.hostname) &&
      url.username === '' &&
      url.password === '' &&
      url.port === ''
      ? url.href
      : null;
  } catch {
    return null;
  }
}
