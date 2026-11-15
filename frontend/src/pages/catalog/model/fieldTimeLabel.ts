/**
 * How a field's time role reads in a table: `是 · 周`, `是（按类型）`, `—`.
 *
 * The calendar (`period_kind`) is ours, not the spec's, and it is what a run's period is written in — so it
 * belongs next to the role rather than hidden in the edit form.
 */
import { isTemporalDatatype } from '../../../data/semanticModelFieldsApi';

const KIND_LABELS: Record<string, string> = {
  day: '日',
  week: '周',
  month: '月',
  quarter: '季',
  year: '年',
  custom: '自定义',
};

export function fieldTimeLabel(
  field: {
    dimension: { is_time?: boolean; period_kind?: string | null } | null;
    datatype?: string | null;
  },
  yes: string,
  byType: string,
  dash: string,
): string {
  const kind = field.dimension?.period_kind ?? null;
  const suffix = kind ? ` · ${KIND_LABELS[kind] ?? kind}` : '';
  if (field.dimension?.is_time === true) return `${yes}${suffix}`;
  if (field.dimension?.is_time === false) return dash;
  return isTemporalDatatype(field.datatype) ? `${byType}${suffix}` : dash;
}
