import { useTranslation } from 'react-i18next';
import { MAX_TRACKER_CELLS, trackerCells, type ReportTrackerView } from './reportView';

const NUMBER = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);

/**
 * A strip of small blocks, one per row — coverage, missingness, streaks.
 *
 * Intensity is the value relative to the largest, so it reads without thresholds (this layer
 * declares none) and the exact value is one hover away. Reads a year of months or a month of days in
 * one line, where a chart or a table would take a screen.
 */
export function ReportTracker({
  view,
  rows,
}: {
  view: ReportTrackerView;
  rows: Array<Record<string, unknown>>;
}) {
  const { t } = useTranslation('ontology');
  const { cells, truncated } = trackerCells(rows, view);

  return (
    <div className="report-tracker">
      {view.label && <span className="report-metric__label">{view.label}</span>}
      <div className="report-tracker__strip">
        {cells.map((cell, i) => (
          <span
            key={`${cell.label}-${i}`}
            className="report-tracker__cell"
            style={{ opacity: 0.25 + cell.intensity * 0.75 }}
            title={`${cell.label}: ${NUMBER(cell.value)}`}
          />
        ))}
      </div>
      <div className="report-tracker__ends">
        {cells.length > 0 && <span>{cells[0].label}</span>}
        {cells.length > 1 && <span>{cells[cells.length - 1].label}</span>}
      </div>
      {truncated && (
        <p className="page-subtitle">{t('dataExplorer.trackerTruncated', { max: MAX_TRACKER_CELLS })}</p>
      )}
    </div>
  );
}
