import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import type { FilterRow } from '../../pages/ontology-manager/datasetRowsFilter';
import './FilterRows.scss';
import { QuickRangeSelect } from '../../pages/ontology-manager/QuickRangeSelect';
import { rangeError, rangeToValues, valuesToRange } from '../../pages/ontology-manager/dateRange';

const NO_VALUE = new Set(['is_null', 'is_not_null']);

/**
 * Filter rows: column, operator, value — and, for the columns that are time dimensions, a **date
 * input** with the quick ranges a person actually asks for, plus a word when a range is reversed
 * (which matches nothing, silently, otherwise).
 *
 * One component for both query builders (the Playground and "add a report"), because the vocabulary
 * is shared: a model's declared fields and a dataset's physical columns differ in where they come
 * from, not in how a filter row is written.
 */
export function FilterRows({
  rows,
  onChange,
  columns,
  timeRefs,
  ops,
}: {
  rows: FilterRow[];
  onChange: (next: FilterRow[]) => void;
  /** `{id, label}` per selectable column — a joined field's label carries its dataset. */
  columns: Array<{ id: string; label: string }>;
  /** Column ids/names that carry dates (a model field with `is_time`, or a `date` column). */
  timeRefs: Set<string>;
  ops: readonly string[];
}) {
  const { t } = useTranslation('ontology');
  const isTime = (ref: string) => timeRefs.has(ref);
  const patch = (id: number, changes: Partial<FilterRow>) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, ...changes } : row)));

  return (
    <>
      {rows.map((row) => (
        <div key={row.id} className="filter-rows__row">
          <select
            className="ds-control"
            value={row.column}
            aria-label={t('datasets.fieldName')}
            onChange={(e) => patch(row.id, { column: e.target.value })}
          >
            <option value="">{t('datasets.selectColumn')}</option>
            {columns.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="ds-control"
            value={row.op}
            aria-label={t('dataModel.playgroundOp')}
            onChange={(e) => patch(row.id, { op: e.target.value })}
          >
            {ops.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          {isTime(row.column) && !NO_VALUE.has(row.op) && (
            <QuickRangeSelect
              ariaLabel={t('datasets.filterQuickRange')}
              onPick={(range) => patch(row.id, rangeToValues(range))}
            />
          )}
          {!NO_VALUE.has(row.op) && (
            <input
              className="ds-control"
              /* A declared time field is a date: typing an ISO day by hand is not a UI. */
              type={isTime(row.column) ? 'date' : 'text'}
              value={row.value}
              aria-label={t('datasets.filterValue')}
              onChange={(e) => patch(row.id, { value: e.target.value })}
            />
          )}
          {row.op === 'between' && (
            <input
              className="ds-control"
              type={isTime(row.column) ? 'date' : 'text'}
              value={row.value2}
              aria-label={t('datasets.filterTo')}
              onChange={(e) => patch(row.id, { value2: e.target.value })}
            />
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-label={t('shared.delete')}
            onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
          >
            <X size={14} aria-hidden />
          </button>
          {rangeError(valuesToRange(row.value, row.value2)) && (
            <p className="page-subtitle--error">{t('datasets.filterRangeInvalid')}</p>
          )}
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() =>
          onChange([...rows, { id: Date.now(), column: '', op: '=', value: '', value2: '' }])
        }
      >
        <Plus size={14} aria-hidden />
        {t('datasets.filterAdd')}
      </button>
    </>
  );
}
