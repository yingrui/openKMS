import type { ExpectedQuery } from '../../data/evaluationsApi';

/**
 * One expectation, as a person reads it.
 *
 * A data-query item's ground truth is a metric plus the dimensions it is grouped by (and any filters), or a SQL
 * statement. Storing a metric's name alone is not enough — `市盈率` is the latest single value and `平均市盈率` an
 * average — so the rows say which one and how it is grouped.
 */
export function expectedQueryText(entry: ExpectedQuery): string {
  const expected = entry.expected;
  if (expected?.refuse) return 'Should refuse: no query may be cited';
  if (expected?.sql) return expected.sql;
  const metricName = expected?.metric?.name ?? entry.metric;
  if (metricName) {
    const parts = [metricName];
    const dims = expected?.dimensions ?? [];
    if (dims.length > 0) parts.push(`by ${dims.join(', ')}`);
    for (const filter of expected?.filters ?? []) {
      if (filter?.field) parts.push(`filter ${filter.field}${filter.op ? ` ${filter.op}` : ''}${filter.value != null ? ` ${String(filter.value)}` : ''}`);
    }
    return parts.join(' · ');
  }
  // Legacy rows: a structural dict of tables/columns.
  if (entry.sql && typeof entry.sql === 'object') {
    const s = entry.sql;
    const bits: string[] = [];
    if (s.tables?.length) bits.push(`tables: ${s.tables.join(', ')}`);
    if (s.group_by?.length) bits.push(`by ${s.group_by.join(', ')}`);
    return bits.length > 0 ? bits.join(' · ') : 'No expectation recorded';
  }
  return 'No expectation recorded';
}

/** The item's expectations, one line each. */
export function expectedQueryLines(entries: ExpectedQuery[] | null | undefined): string[] {
  return (entries ?? []).map(expectedQueryText);
}
