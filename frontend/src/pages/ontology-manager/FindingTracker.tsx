import { useTranslation } from 'react-i18next';
import { formatNumber } from './findingFormat';
import { MAX_TRACKER_CELLS, trackerCells, type FindingTrackerView } from './findingView';

/**
 * A strip of small blocks, one per row — coverage, missingness, streaks.
 *
 * Intensity is the value relative to the largest, so it reads without thresholds (this layer
 * declares none) and the exact value is one hover away. Reads a year of months or a month of days in
 * one line, where a chart or a table would take a screen.
 */
export function FindingTracker({
  view,
  rows,
}: {
  view: FindingTrackerView;
  rows: Array<Record<string, unknown>>;
}) {
  const { t } = useTranslation('ontology');
  const { cells, truncated } = trackerCells(rows, view);

  return (
    <div className="finding-tracker">
      {view.label && <span className="finding-metric__label">{view.label}</span>}
      <div className="finding-tracker__strip">
        {cells.map((cell, i) => (
          <span
            key={`${cell.label}-${i}`}
            className="finding-tracker__cell"
            style={{ opacity: 0.25 + cell.intensity * 0.75 }}
            title={`${cell.label}: ${formatNumber(cell.value)}`}
          />
        ))}
      </div>
      <div className="finding-tracker__ends">
        {cells.length > 0 && <span>{cells[0].label}</span>}
        {cells.length > 1 && <span>{cells[cells.length - 1].label}</span>}
      </div>
      {truncated && (
        <p className="page-subtitle">{t('dataInsights.trackerTruncated', { max: MAX_TRACKER_CELLS })}</p>
      )}
    </div>
  );
}
