import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import type { FilterRow } from './modelPlaygroundSpec';
import { QuickRangeSelect } from './QuickRangeSelect';
import { rangeError, rangeToValues, valuesToRange } from './dateRange';

const NO_VALUE = new Set(['is_null', 'is_not_null']);

/**
 * The Playground's filter rows: field, operator, value — and, for the fields the model declares as
 * time dimensions, a **date input** with the quick ranges a person actually asks for, plus a word
 * when a range is reversed (which matches nothing, silently, otherwise).
 *
 * Extracted from `ModelPlaygroundSection` when it hit the 700-line guardrail: this is a
 * self-contained editor over the rows, and the section keeps the layout around it.
 */
export function PlaygroundFilters({
  rows,
  onChange,
  fieldOptions,
  timeRefs,
  ops,
}: {
  rows: FilterRow[];
  onChange: (next: FilterRow[]) => void;
  /** `{id, label}` per selectable field — the label carries its dataset when it is a joined one. */
  fieldOptions: Array<{ id: string; label: string }>;
  /** Field ids/names the model declares as time dimensions. */
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
        <div key={row.id} className="playground__filter">
          <select
            className="ds-control"
            value={row.field}
            aria-label={t('datasets.fieldName')}
            onChange={(e) => patch(row.id, { field: e.target.value })}
          >
            <option value="">{t('datasets.selectColumn')}</option>
            {fieldOptions.map((option) => (
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
          {isTime(row.field) && !NO_VALUE.has(row.op) && (
            <QuickRangeSelect
              ariaLabel={t('datasets.filterQuickRange')}
              onPick={(range) => patch(row.id, rangeToValues(range))}
            />
          )}
          {!NO_VALUE.has(row.op) && (
            <input
              className="ds-control"
              /* A declared time field is a date: typing an ISO day by hand is not a UI. */
              type={isTime(row.field) ? 'date' : 'text'}
              value={row.value}
              aria-label={t('datasets.filterValue')}
              onChange={(e) => patch(row.id, { value: e.target.value })}
            />
          )}
          {row.op === 'between' && (
            <input
              className="ds-control"
              type={isTime(row.field) ? 'date' : 'text'}
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
          onChange([...rows, { id: Date.now(), field: '', op: '=', value: '', value2: '' }])
        }
      >
        <Plus size={14} aria-hidden />
        {t('dataModel.playgroundAddFilter')}
      </button>
    </>
  );
}
