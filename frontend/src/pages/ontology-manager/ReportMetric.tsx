import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { formatNumber, formatPercent } from './reportFormat';
import { numericValue, metricDelta, metricSeries, metricValue, type ReportMetricView } from './reportView';

/**
 * A number, and what it is.
 *
 * Without a `trend` it is the query reduced to one row. With one it is a **KPI** (Tremor's `Metric` +
 * `BadgeDelta` + sparkline, on our tokens): the series' last value, the change against the previous
 * one, and the shape behind both. The sparkline is drawn as bars in CSS — a KPI needs no chart
 * runtime, and a bar per point stays readable at 24px.
 */
export function ReportMetric({
  view,
  rows,
}: {
  view: ReportMetricView;
  rows: Array<Record<string, unknown>>;
}) {
  const { t } = useTranslation('ontology');
  const raw = metricValue(rows, view);
  const numeric = numericValue(raw);
  const shown =
    numeric === null
      ? raw === null || raw === undefined
        ? t('datasets.dash')
        : String(raw)
      : formatNumber(numeric);
  const delta = view.trend ? metricDelta(rows, view) : null;
  const series = view.trend ? metricSeries(rows, view) : [];
  const largest = series.reduce((max, p) => Math.max(max, Math.abs(p.value)), 0);
  const DeltaIcon = delta?.direction === 'up' ? ArrowUp : delta?.direction === 'down' ? ArrowDown : Minus;

  return (
    <div className="report-metric">
      <span className="report-metric__value">{shown}</span>
      <span className="report-metric__label">{view.label ?? view.column}</span>
      {delta && (
        <span className={`report-metric__delta report-metric__delta--${delta.direction}`}>
          <DeltaIcon size={14} aria-hidden />
          {delta.ratio === null ? t('dataExplorer.deltaNoBaseline') : formatPercent(delta.ratio)}
          <span className="report-metric__delta-note">
            {t('dataExplorer.deltaVsPrevious', { previous: formatNumber(delta.previous) })}
          </span>
        </span>
      )}
      {series.length > 1 && (
        <span className="report-metric__spark" aria-hidden>
          {series.map((point, i) => (
            <span
              key={`${point.label}-${i}`}
              className="report-metric__spark-bar"
              style={{ height: `${largest > 0 ? Math.max(8, (Math.abs(point.value) / largest) * 100) : 8}%` }}
            />
          ))}
        </span>
      )}
      {view.trend && series.length === 0 && rows.length > 0 && (
        <span className="report-metric__label">{t('dataExplorer.noNumericSeries')}</span>
      )}
    </div>
  );
}
