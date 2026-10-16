import { useTranslation } from 'react-i18next';
import { formatNumber } from './reportFormat';
import { MAX_BAR_LIST_ROWS, barListRows, type ReportBarListView } from './reportView';

/**
 * A ranking: one row per category, bar and share beside the label.
 *
 * A "top 10 by X" reads far better as a list than as ten bars — the labels never clip, and the share
 * makes the gap visible. Plain CSS on purpose: no chart runtime for a sorted list.
 */
export function ReportBarList({
  view,
  rows,
}: {
  view: ReportBarListView;
  rows: Array<Record<string, unknown>>;
}) {
  const { t } = useTranslation('ontology');
  const { rows: ranked, truncated } = barListRows(rows, view);
  const widest = ranked.reduce((max, r) => Math.max(max, Math.abs(r.value)), 0) || 1;

  return (
    <div className="report-bar-list">
      <ul className="report-bar-list__rows">
        {ranked.map((row, i) => (
          <li key={`${row.label}-${i}`} className="report-bar-list__row">
            <span className="report-bar-list__label" title={row.label}>
              {row.label || t('datasets.dash')}
            </span>
            <span
              className="report-bar-list__bar"
              style={{ width: `${(Math.abs(row.value) / widest) * 100}%` }}
              aria-hidden
            />
            <span className="report-bar-list__value">
              {formatNumber(row.value)}
            </span>
            <span className="report-bar-list__share">{Math.round(row.share * 100)}%</span>
          </li>
        ))}
      </ul>
      {truncated && (
        <p className="page-subtitle">{t('dataExplorer.barListTruncated', { max: MAX_BAR_LIST_ROWS })}</p>
      )}
    </div>
  );
}
