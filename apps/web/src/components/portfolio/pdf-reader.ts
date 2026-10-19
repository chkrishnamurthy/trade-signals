/**
 * Reads a PDF the user chose (a CAS or a contract note) into text lines, in
 * the browser. Neither the file nor its password is sent anywhere: only the
 * rows read from it go on, and only after the user has seen them.
 */

/** Statements and contract notes are a few pages; this bounds a stray large file. */
export const MAX_PDF_PAGES = 80;

export type PdfLines =
  | { ok: true; lines: string[] }
  | { ok: false; reason: 'needs_password' | 'wrong_password' | 'unreadable'; message: string };

interface TextItem {
  readonly str: string;
  readonly transform: readonly number[];
}

/** Text pieces into lines: same height on the page (within 2 points), left to right. */
export function itemsToLines(items: readonly TextItem[]): string[] {
  const rows: { y: number; parts: { x: number; s: string }[] }[] = [];
  for (const item of items) {
    const text = item.str.trim();
    if (text === '') continue;
    const x = item.transform[4] ?? 0;
    const y = item.transform[5] ?? 0;
    const row = rows.find((r) => Math.abs(r.y - y) <= 2);
    if (row === undefined) rows.push({ y, parts: [{ x, s: text }] });
    else row.parts.push({ x, s: text });
  }
  // PDF y grows upwards: the top of the page first.
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) =>
      r.parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.s)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((line) => line !== '');
}

export async function readPdfLines(file: File, password?: string): Promise<PdfLines> {
  try {
    const { getDocumentProxy } = await import('unpdf');
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(
      data,
      password === undefined || password === '' ? {} : { password },
    );
    const lines: string[] = [];
    for (let n = 1; n <= Math.min(pdf.numPages, MAX_PDF_PAGES); n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      lines.push(
        ...itemsToLines(
          content.items.flatMap((i) =>
            'str' in i ? [{ str: i.str, transform: i.transform }] : [],
          ),
        ),
      );
    }
    return { ok: true, lines };
  } catch (error) {
    // pdf.js: code 1 = a password is needed, 2 = the password is wrong.
    const e = error as { name?: string; code?: number };
    if (e?.name === 'PasswordException')
      return e.code === 2
        ? { ok: false, reason: 'wrong_password', message: 'That password did not open the file.' }
        : {
            ok: false,
            reason: 'needs_password',
            message: 'This file is locked with a password. Enter it to open the file here.',
          };
    return {
      ok: false,
      reason: 'unreadable',
      message:
        'We could not read that PDF. If it is a scan (a picture of a page), it has no text to read.',
    };
  }
}
