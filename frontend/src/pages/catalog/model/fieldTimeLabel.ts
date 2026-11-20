/**
 * How a field's time role reads in a table: `是 · 周`, `是（按类型）`, `—`.
 *
 * The calendar is what a run's period is written in, so it belongs next to the role rather than hidden in the
 * edit form. Both values come from the server (`is_time` / `period_kind`), which resolves them from the field's
 * override, the datatype and the column's `time_format` — deriving them here would be a second answer.
 */

const KIND_LABELS: Record<string, string> = {
  day: '日',
  week: '周',
  month: '月',
  quarter: '季',
  year: '年',
  custom: '自定义',
};

export function fieldTimeLabel(
  field: { is_time?: boolean; period_kind?: string | null },
  yes: string,
  dash: string,
): string {
  if (field.is_time !== true) return dash;
  const kind = field.period_kind ?? null;
  return kind ? `${yes} · ${KIND_LABELS[kind] ?? kind}` : yes;
}
