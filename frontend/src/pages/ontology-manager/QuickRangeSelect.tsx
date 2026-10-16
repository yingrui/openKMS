import { useTranslation } from 'react-i18next';
import { QUICK_RANGE_IDS, quickRange, type DateRange, type QuickRangeId } from './dateRange';

/**
 * "Last month" in one click — the ranges a person actually asks a date filter for.
 *
 * It only computes the two days and hands them back; the caller decides what a filter row does with
 * them (the Data tab commits the bar, the Playground sets its row). Today's date is read *here*, so
 * the ranges themselves stay pure and testable.
 */
export function QuickRangeSelect({
  onPick,
  ariaLabel,
}: {
  onPick: (range: DateRange) => void;
  ariaLabel: string;
}) {
  const { t } = useTranslation('ontology');
  return (
    <select
      className="ds-control openkms-w-fit"
      aria-label={ariaLabel}
      value=""
      onChange={(e) => {
        const id = e.target.value as QuickRangeId;
        if (!id) return;
        onPick(quickRange(id, new Date()));
      }}
    >
      <option value="">{t('datasets.filterQuickRange')}</option>
      {QUICK_RANGE_IDS.map((id) => (
        <option key={id} value={id}>
          {t(`datasets.quickRange_${id}`)}
        </option>
      ))}
    </select>
  );
}
