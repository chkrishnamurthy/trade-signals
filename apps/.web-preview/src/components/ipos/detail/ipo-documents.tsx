import { shortDate } from '@/lib/ipo-format';
import type { IpoDocumentDto, SebiFilingDto } from '@/lib/ipo-types';
import { ExternalLink, FactRow, ModuleCard } from '../module-card';

const KIND_LABEL: Readonly<Record<IpoDocumentDto['kind'], string>> = {
  drhp: 'Draft Red Herring Prospectus',
  rhp: 'Red Herring Prospectus',
  prospectus: 'Prospectus',
  addendum: 'Addendum / corrigendum',
  basis_of_allotment: 'Basis of allotment',
  anchor_allocation: 'Anchor allocation',
  price_band_ad: 'Price-band advertisement',
};

/** The prospectus first, then the documents around it. */
const ORDER: readonly IpoDocumentDto['kind'][] = [
  'rhp',
  'drhp',
  'prospectus',
  'addendum',
  'basis_of_allotment',
  'anchor_allocation',
  'price_band_ad',
];

const format = (url: string) =>
  url.endsWith('.zip') ? 'zip' : url.endsWith('.pdf') ? 'PDF' : 'page';

/** Official documents, linked where the exchange or regulator hosts them — never copied. */
export function IpoDocuments({
  documents,
  filings = [],
  exchange,
}: {
  documents: readonly IpoDocumentDto[];
  /** The DRHP and its addenda as filed with SEBI. */
  filings?: readonly SebiFilingDto[];
  /** Who hosts the exchange documents, for the format note. */
  exchange: string;
}) {
  return (
    <ModuleCard
      id="documents"
      title="Documents"
      note="Read the RHP — especially its Risk Factors — before investing."
    >
      {documents.length === 0 && filings.length === 0 && (
        <p className="border-border border-t px-4 py-3 text-muted-foreground text-xs">
          The exchange has not published document links for this issue yet.
        </p>
      )}
      {[...documents]
        .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
        .map((doc) => (
          <FactRow
            key={doc.url}
            label={
              <ExternalLink href={doc.url} className="text-sm">
                {KIND_LABEL[doc.kind]}
              </ExternalLink>
            }
          >
            <span className="text-muted-foreground text-xs">
              {format(doc.url)} · {exchange}
            </span>
          </FactRow>
        ))}
      {filings.map((f) => (
        <FactRow
          key={f.sebiId}
          label={
            <ExternalLink href={f.pageUrl} className="text-sm">
              {f.documentLabel ?? 'Offer document'}
            </ExternalLink>
          }
        >
          <span className="text-muted-foreground text-xs">SEBI · {shortDate(f.filedDate)}</span>
        </FactRow>
      ))}
    </ModuleCard>
  );
}
