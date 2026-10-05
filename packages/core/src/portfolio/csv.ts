/**
 * Minimal RFC-4180 reader: quoted fields, doubled quotes, CRLF or LF, a leading
 * byte-order mark. Pure and dependency-free. It returns every record, including
 * blank ones, as arrays of trimmed strings; callers skip what they do not want.
 */
export function readCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let sawAny = false;

  const endField = () => {
    row.push(field.trim());
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    sawAny = false;
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input.charAt(i);
    if (quoted) {
      if (ch === '"') {
        if (input.charAt(i + 1) === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      sawAny = true;
    } else if (ch === ',') {
      endField();
      sawAny = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input.charAt(i + 1) === '\n') i++;
      endRow();
    } else {
      field += ch;
      sawAny = true;
    }
  }
  if (sawAny || field !== '' || row.length > 0) endRow();
  return rows;
}
