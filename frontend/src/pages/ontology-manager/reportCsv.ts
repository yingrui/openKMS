/**
 * A report's rows as CSV — the same numbers the table shows, in a file.
 *
 * Pure so the escaping is testable: a value with a comma, a quote or a newline must survive a round
 * trip through a spreadsheet, and a null must be an empty cell rather than the word "null".
 */

/** RFC 4180: quote a field, doubling any quote inside it, only when it needs it. */
function field(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The rows as CSV text, with a header row.
 *
 * A **BOM** is prepended because Excel on Windows reads a UTF-8 file without one as Latin-1 — the
 * Chinese labels in this product would arrive as mojibake.
 */
export function toCsv(columns: string[], rows: Array<Record<string, unknown>>): string {
  const lines = [columns.map(field).join(',')];
  for (const row of rows) lines.push(columns.map((c) => field(row[c])).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** A file name a file system will accept, from the report title (or the dashboard's name). */
export function csvFileName(...candidates: Array<string | null | undefined>): string {
  const name = candidates.find((c) => c && c.trim()) ?? 'report';
  const safe = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return `${safe || 'report'}.csv`;
}

/** Hand a file to the browser. The only impure part of exporting, kept to three lines. */
export function downloadCsv(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
