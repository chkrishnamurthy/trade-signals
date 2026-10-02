import { extractText, getDocumentProxy } from 'unpdf';
import { isZip, readZip } from './zip.js';

/**
 * From downloaded bytes to page texts (docs/planning/ipos-plan.md Phase 11).
 *
 * An exchange serves an RHP either as a PDF or as a zip bundle (NSE:
 * `RHP.pdf` + `GID.pdf`; BSE: `RHP&GID_….zip`). The bundle's RHP is the entry
 * whose name says RHP, else the largest PDF in it. Text comes from pdf.js
 * (via `unpdf`), one string per page.
 */

const isPdf = (bytes: Uint8Array) =>
  bytes.length >= 5 && new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-';

/** The RHP's PDF bytes: the download itself, or the right entry in a zip. */
export function rhpPdfBytes(bytes: Uint8Array, maxBytes: number): Uint8Array {
  if (isPdf(bytes)) return bytes;
  if (!isZip(bytes)) throw new Error('the document is neither a PDF nor a zip');
  const pdfs = readZip(bytes, maxBytes).filter((e) => /\.pdf$/i.test(e.name));
  const named = pdfs.find((e) =>
    /(^|[/_\s-])RHP\b|red\s*herring/i.test(e.name.split('/').pop() ?? ''),
  );
  const largest = [...pdfs].sort((a, b) => b.size - a.size)[0];
  const entry = named ?? largest;
  if (entry === undefined) throw new Error('the zip holds no PDF');
  const pdf = entry.read();
  if (!isPdf(pdf)) throw new Error(`${entry.name} is not a PDF`);
  return pdf;
}

/** One text string per page, `pages[0]` being page 1. */
export async function pdfPageTexts(pdf: Uint8Array, maxPages: number): Promise<string[]> {
  // pdf.js takes ownership of (and may detach) the buffer it is given.
  const document = await getDocumentProxy(new Uint8Array(pdf));
  try {
    if (document.numPages > maxPages)
      throw new Error(`${document.numPages} pages exceeds the ${maxPages}-page cap`);
    const { text } = await extractText(document, { mergePages: false });
    return text;
  } finally {
    await document.loadingTask.destroy();
  }
}
