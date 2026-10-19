import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { pdfPageTexts, rhpPdfBytes } from './rhp-document.js';
import { crc32, isZip, readZip } from './zip.js';

const encoder = new TextEncoder();

/** A tiny but valid PDF, one page per text, with a correct xref table. */
function pdfOf(pages: readonly string[]): Uint8Array {
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((text, i) => {
    const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
    objects[4 + i * 2] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`;
    objects[5 + i * 2] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1)
    out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return encoder.encode(out);
}

/** A zip of deflated entries, written the way `zip` writes one. */
function zipOf(
  files: readonly { name: string; data: Uint8Array; corruptCrc?: boolean }[],
): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const body = new Uint8Array(deflateRawSync(file.data));
    const crc = file.corruptCrc === true ? 1 : crc32(file.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, 8, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, file.data.length, true);
    local.setUint16(26, name.length, true);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(10, 8, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, body.length, true);
    entry.setUint32(24, file.data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    chunks.push(new Uint8Array(local.buffer), name, body);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of all) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

describe('readZip', () => {
  it('lists and inflates entries, checking each checksum', () => {
    const zip = zipOf([
      { name: 'a.txt', data: encoder.encode('hello hello hello') },
      { name: 'dir/b.txt', data: encoder.encode('world') },
    ]);
    expect(isZip(zip)).toBe(true);
    const entries = readZip(zip, 1_000);
    expect(entries.map((e) => e.name)).toEqual(['a.txt', 'dir/b.txt']);
    expect(new TextDecoder().decode(entries[1]?.read())).toBe('world');
  });

  it('refuses an entry over the size cap before inflating it', () => {
    const zip = zipOf([{ name: 'big.bin', data: new Uint8Array(5_000) }]);
    expect(() => readZip(zip, 1_000)[0]?.read()).toThrow(/exceeds the 1000-byte cap/);
  });

  it('refuses a corrupted entry', () => {
    const zip = zipOf([{ name: 'a.txt', data: encoder.encode('abc'), corruptCrc: true }]);
    expect(() => readZip(zip, 1_000)[0]?.read()).toThrow(/checksum mismatch/);
  });

  it('refuses something that is not a zip', () => {
    expect(() => readZip(encoder.encode('just text, no archive'), 1_000)).toThrow(/not a zip/);
  });
});

describe('rhpPdfBytes / pdfPageTexts', () => {
  const rhp = pdfOf(['TABLE OF CONTENTS', 'RISK FACTORS']);
  const gid = pdfOf(['General Information Document']);

  it('takes a PDF as it is', () => {
    expect(rhpPdfBytes(rhp, 1_000_000)).toBe(rhp);
  });

  it('picks the RHP out of an exchange bundle by name, not size', () => {
    const bundle = zipOf([
      { name: 'RHP_VNL/GID.pdf', data: pdfOf(['General Information Document', 'x', 'y', 'z']) },
      { name: 'RHP_VNL/RHP.pdf', data: rhp },
    ]);
    expect(rhpPdfBytes(bundle, 1_000_000)).toEqual(rhp);
  });

  it('falls back to the largest PDF when no entry is named RHP', () => {
    const bundle = zipOf([
      { name: 'small.pdf', data: gid },
      { name: 'offer-document.pdf', data: rhp },
      { name: 'notes.txt', data: encoder.encode('x'.repeat(10_000)) },
    ]);
    expect(rhpPdfBytes(bundle, 1_000_000)).toEqual(rhp);
  });

  it('rejects a download that is neither', () => {
    expect(() => rhpPdfBytes(encoder.encode('<html>blocked</html>'), 1_000)).toThrow(
      /neither a PDF nor a zip/,
    );
  });

  it('reads one text string per page', async () => {
    const pages = await pdfPageTexts(rhp, 10);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain('TABLE OF CONTENTS');
    expect(pages[1]).toContain('RISK FACTORS');
  });

  it('refuses a document over the page cap', async () => {
    await expect(pdfPageTexts(rhp, 1)).rejects.toThrow(/exceeds the 1-page cap/);
  });
});
