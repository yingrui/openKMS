import { useTranslation } from 'react-i18next';

/** The dashed card that adds a chart: a property of this type, or one of a neighbour's through a link. */
export function ObjectSetChartAdd({
  options,
  onAdd,
}: {
  options: { value: string; label: string }[];
  onAdd: (prop: string) => void;
}) {
  const { t } = useTranslation('explore');
  if (options.length === 0) return null;
  return (
    <div className="object-set-chart object-set-chart--add">
      <label className="object-set-chart__title" htmlFor="object-set-add-chart">
        {t('objectSet.chartAdd')}
      </label>
      <select
        id="object-set-add-chart"
        className="ds-control ds-control--compact object-set-chart__add-select"
        value=""
        onChange={(e) => {
          if (e.target.value) onAdd(e.target.value);
        }}
      >
        <option value="">{t('objectSet.chartAddPick')}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
