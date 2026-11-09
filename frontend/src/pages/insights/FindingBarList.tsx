import { useTranslation } from 'react-i18next';
import { formatNumber } from './findingFormat';
import { MAX_BAR_LIST_ROWS, barListRows, type FindingBarListView } from './findingView';

/**
 * A ranking: one row per category, bar and share beside the label.
 *
 * A "top 10 by X" reads far better as a list than as ten bars — the labels never clip, and the share
 * makes the gap visible. Plain CSS on purpose: no chart runtime for a sorted list.
 */
export function FindingBarList({
  view,
  rows,
}: {
  view: FindingBarListView;
  rows: Array<Record<string, unknown>>;
}) {
  const { t } = useTranslation('ontology');
  const { rows: ranked, truncated } = barListRows(rows, view);
  const widest = ranked.reduce((max, r) => Math.max(max, Math.abs(r.value)), 0) || 1;

  return (
    <div className="finding-bar-list">
      <ul className="finding-bar-list__rows">
        {ranked.map((row, i) => (
          <li key={`${row.label}-${i}`} className="finding-bar-list__row">
            <span className="finding-bar-list__label" title={row.label}>
              {row.label || t('datasets.dash')}
            </span>
            <span
              className="finding-bar-list__bar"
              style={{ width: `${(Math.abs(row.value) / widest) * 100}%` }}
              aria-hidden
            />
            <span className="finding-bar-list__value">
              {formatNumber(row.value)}
            </span>
            <span className="finding-bar-list__share">{Math.round(row.share * 100)}%</span>
          </li>
        ))}
      </ul>
      {truncated && (
        <p className="page-subtitle">{t('dataInsights.barListTruncated', { max: MAX_BAR_LIST_ROWS })}</p>
      )}
    </div>
  );
}
