// A small RFC 4180 reader for bank statements (SPEC T37). No dependency: a
// statement is a few thousand rows at most, and every quirk banks ship is
// handled here in one place. Pure, so it runs in the import worker and in
// tests alike.

export type Delimiter = "," | ";" | "\t" | "|";

const DELIMITERS: readonly Delimiter[] = [",", ";", "\t", "|"];

/** Rows of cells. Quoted cells keep their inner commas, quotes and line breaks. */
export function parseCsv(text: string, delimiter: Delimiter = sniffDelimiter(text)): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;
  while (i < src.length) {
    const c = src.charAt(i);
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      cell += c;
      i++;
      continue;
    }
    if (c === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
      i++;
    } else if (c === delimiter) {
      row.push(cell);
      cell = "";
      i++;
    } else if (c === "\r" || c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += c === "\r" && src[i + 1] === "\n" ? 2 : 1;
    } else {
      cell += c;
      i++;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((v) => v.trim())).filter((r) => r.some((v) => v !== ""));
}

/** The delimiter that splits the first lines most evenly into more than one cell. */
export function sniffDelimiter(text: string): Delimiter {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "").slice(0, 20);
  let best: Delimiter = ",";
  let bestScore = 0;
  for (const d of DELIMITERS) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    const most = Math.max(0, ...counts);
    if (most === 0) continue;
    // Lines that agree with the widest one: preamble lines don't, the table does.
    const score = counts.filter((n) => n === most).length * most;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

function countOutsideQuotes(line: string, d: string): number {
  let n = 0;
  let quoted = false;
  for (const c of line) {
    if (c === '"') quoted = !quoted;
    else if (c === d && !quoted) n++;
  }
  return n;
}
