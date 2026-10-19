/** Rupee text a person types ("1,245.50") to integer paise, or null. No floats are involved. */
export function parseRupeesInput(text: string): number | null {
  const cleaned = text.trim().replace(/,/g, '').replace(/^₹/, '');
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (m === null) return null;
  const paise = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
  return Number.isSafeInteger(paise) ? paise : null;
}

/** Integer paise as plain "1234.50" for a CSV cell: no symbol, no grouping, no float. */
export function paiseToPlain(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
