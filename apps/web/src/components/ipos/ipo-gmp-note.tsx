/**
 * The grey-market note at the foot of every IPO surface that shows GMP: GMP is
 * unofficial and must always be labelled as such. The text comes from the
 * server DTO so the page and the API say exactly the same thing.
 */
export function IpoGmpNote({ gmpNote, show }: { gmpNote: string; show: boolean }) {
  if (!show) return null;
  return <p className="text-2xs text-muted-foreground">{gmpNote}</p>;
}
