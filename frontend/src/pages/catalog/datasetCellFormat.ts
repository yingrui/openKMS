/**
 * How a dataset cell reads, in one place — a table row and a file row are the same data.
 *
 * Dates arrive as `2026-08-03T00:00:00.000` and numbers as floats; showing either raw is what made the file
 * dataset's sample look like a different product from the table's grid.
 */
export function formatCell(value: unknown, dash: string): string {
  if (value === null || value === undefined) return dash;
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace('T', ' ');
  if (typeof value === 'string') {
    // An ISO date-time from a parquet/CSV column: show the instant, not the microsecond padding.
    const iso = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(value);
    return iso ? `${iso[1]} ${iso[2]}` : value;
  }
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
