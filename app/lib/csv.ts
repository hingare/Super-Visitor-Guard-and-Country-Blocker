// Small CSV writer and reader (RFC 4180: commas, double quotes, CRLF).

type Cell = string | number | boolean | null | undefined | Date;

// Spreadsheet apps run a cell that starts with one of these as a formula, so
// exported text (user agents, referrers, comments) could carry one. A leading
// apostrophe keeps it as text.
const FORMULA_START = /^[=+\-@\t\r]/;

function formatCell(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  let text = cell instanceof Date ? cell.toISOString() : String(cell);
  if (typeof cell === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsvRow(cells: Cell[]): string {
  return cells.map(formatCell).join(",") + "\r\n";
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return toCsvRow(header) + rows.map(toCsvRow).join("");
}

// Parses CSV text into rows of cells. Blank lines are skipped.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const endRow = () => {
    row.push(cell);
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
    cell = "";
  };

  for (; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}

// Undoes the apostrophe that toCsv puts in front of formula-like text.
export function unguardCell(cell: string): string {
  return cell.startsWith("'") && FORMULA_START.test(cell.slice(1)) ? cell.slice(1) : cell;
}
