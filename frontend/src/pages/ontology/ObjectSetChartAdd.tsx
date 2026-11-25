import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * The tile that adds a chart.
 *
 * It is a label over a native select: the tile is what a reader sees, and the native picker is what they get
 * — no hand-rolled dropdown, and the whole tile is the hit area instead of a control sitting inside a card.
 */
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
    <label className="object-set-chart-add" htmlFor="object-set-add-chart">
      <span className="object-set-chart-add__icon" aria-hidden>
        <Plus size={18} />
      </span>
      <span className="object-set-chart-add__label">{t('objectSet.chartAdd')}</span>
      <span className="object-set-chart-add__hint">{t('objectSet.chartAddPick')}</span>
      {/* ds-control-exempt: the tile is the control, this select is the invisible overlay that opens the picker */}
      <select
        id="object-set-add-chart"
        className="object-set-chart-add__select"
        value=""
        onChange={(event) => {
          if (event.target.value) onAdd(event.target.value);
        }}
      >
        <option value="">{t('objectSet.chartAddPick')}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
