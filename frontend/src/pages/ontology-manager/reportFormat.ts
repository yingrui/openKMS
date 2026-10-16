/**
 * How a report's numbers are written.
 *
 * One place, because the same value appears in a KPI, a ranking, a strip and a chart tooltip — and
 * four copies of `new Intl.NumberFormat(...)` is how one of them ends up with different rounding.
 */

/** A measure: at most two decimals, thousands separated. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

/** A change: signed, one decimal (`-6.0%`). */
export function formatPercent(ratio: number): string {
  const percent = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(ratio * 100);
  return `${ratio > 0 ? '+' : ''}${percent}%`;
}
