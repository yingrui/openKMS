import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { PropertyDef } from '../../data/ontologyApi';
import { FILTER_OPS, formatFilter, parseFilterText, type FilterOp } from './objectSetCondition';

/**
 * The object set's conditions, as chips.
 *
 * A condition is part of the URL, so this component only reports intent (`onChange`) — it does not own state.
 * Chips are the readable form of `f=…`, which keeps "what am I looking at" answerable without opening a panel.
 */
export function ObjectSetFilters({
  filters,
  properties,
  onChange,
}: {
  filters: string[];
  properties: PropertyDef[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation('explore');
  const [open, setOpen] = useState(false);
  const [prop, setProp] = useState(properties[0]?.name ?? '');
  const [op, setOp] = useState<FilterOp>('eq');
  const [value, setValue] = useState('');
  const canAdd = prop !== '' && value.trim() !== '';

  return (
    <div className="object-set-filters">
      {filters.map((filter) => {
        const parsed = parseFilterText(filter);
        const label = parsed
          ? `${parsed.prop} ${t(`objectSet.op.${parsed.op}`)} ${parsed.value}`
          : filter;
        return (
          <span key={filter} className="object-set-filters__chip">
            {label}
            <button
              type="button"
              className="object-set-filters__remove"
              aria-label={t('objectSet.removeFilter', { name: label })}
              onClick={() => onChange(filters.filter((f) => f !== filter))}
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        );
      })}
      {filters.length > 0 ? (
        <button
          type="button"
          className="btn-link object-set-filters__clear"
          onClick={() => onChange([])}
        >
          {t('objectSet.clearFilters')}
        </button>
      ) : (
        <span className="object-set-filters__hint">{t('objectSet.noFilters')}</span>
      )}
      {properties.length > 0 && !open ? (
        <button
          type="button"
          className="btn-link"
          onClick={() => setOpen(true)}
        >
          {t('objectSet.addFilter')}
        </button>
      ) : null}
      {properties.length > 0 && open ? (
        <span className="object-set-filters__add">
          <select
            className="ds-control ds-control--compact"
            value={prop}
            onChange={(e) => setProp(e.target.value)}
            aria-label={t('objectSet.filterProp')}
          >
            {properties.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            className="ds-control ds-control--compact"
            value={op}
            onChange={(e) => setOp(e.target.value as FilterOp)}
            aria-label={t('objectSet.filterOp')}
          >
            {FILTER_OPS.map((candidate) => (
              <option key={candidate} value={candidate}>
                {t(`objectSet.op.${candidate}`)}
              </option>
            ))}
          </select>
          <input
            className="ds-control ds-control--compact object-set-filters__value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t('objectSet.filterValue')}
            aria-label={t('objectSet.filterValue')}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canAdd}
            onClick={() => {
              onChange([...filters, formatFilter(prop, op, value.trim())]);
              setValue('');
              setOpen(false);
            }}
          >
            {t('objectSet.addFilter')}
          </button>
          <button
            type="button"
            className="btn-link"
            onClick={() => setOpen(false)}
          >
            {t('shared.cancel')}
          </button>
        </span>
      ) : null}
    </div>
  );
}
