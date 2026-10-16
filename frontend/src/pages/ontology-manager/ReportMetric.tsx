import { useTranslation } from 'react-i18next';
import { numericValue, type ReportMetricView } from './reportView';

/**
 * A number, and what it is: the answer a query reduced to a single row.
 *
 * Half of a real dashboard is single numbers (a total, a share, an average), and neither a chart nor
 * a table reads well for them. Borrowed from Tremor's `Metric` idea, drawn with our own tokens.
 */
export function ReportMetric({
  view,
  rows,
}: {
  view: ReportMetricView;
  rows: Array<Record<string, unknown>>;
}) {
  const { t } = useTranslation('ontology');
  const raw = rows[0]?.[view.column];
  const numeric = numericValue(raw);
  const shown =
    numeric === null
      ? raw === null || raw === undefined
        ? t('datasets.dash')
        : String(raw)
      : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(numeric);
  const isCount = view.column.toLowerCase() === 'count';

  return (
    <div className="report-metric">
      <span className="report-metric__value">{shown}</span>
      <span className="report-metric__label">
        {view.label ?? view.column}
        {isCount && rows.length === 1 ? '' : ''}
      </span>
    </div>
  );
}
