/**
 * The IPO disclaimer (plan §11) — at the foot of every IPO surface, quiet but
 * complete. The text comes from the server DTO so the page and the API say
 * exactly the same thing.
 */
export function IpoDisclaimer({
  disclaimer,
  gmpNote,
  showGmp,
}: {
  disclaimer: string;
  gmpNote: string;
  showGmp: boolean;
}) {
  return (
    <aside
      aria-label="Disclaimer"
      className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-sunken px-4 py-3 text-muted-foreground text-xs"
    >
      <strong className="font-semibold text-foreground text-sm">
        Information only — not investment advice
      </strong>
      <p>{disclaimer}</p>
      {showGmp && <p>{gmpNote}</p>}
    </aside>
  );
}
