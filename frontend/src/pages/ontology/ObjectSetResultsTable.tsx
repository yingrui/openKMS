import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react';
import type { ObjectInstanceResponse, PropertyDef } from '../../data/ontologyApi';
import type { ActionApplicability } from '../../data/ontologyActionsApi';
import { rowSatisfies } from './inlineEditCriteria';
import { parseSortList, sortRank } from './objectSetSort';

/** Keep the row's own type: typing `1` into a boolean column would otherwise store the string "true". */
const coerce = (draft: string, previous: unknown): unknown => {
  if (typeof previous === 'boolean') return draft.trim().toLowerCase() === 'true' || draft.trim() === '1';
  if (typeof previous === 'number') {
    const number = Number(draft);
    return Number.isFinite(number) ? number : previous;
  }
  return draft;
};

const cellText = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

/**
 * The results perspective: the same object set as rows, sortable, selectable.
 *
 * Selection exists for the one thing rows can do that charts cannot — name a handful of objects and act on them.
 * The boxes are therefore the entry point to Actions, not a bulk-edit affordance of their own.
 */
export function ObjectSetResultsTable({
  instances,
  columns,
  sort,
  onSort,
  selected,
  onToggle,
  onToggleAll,
  inlineActions,
  onInlineSubmit,
  labels,
}: {
  instances: ObjectInstanceResponse[];
  /** The properties to show, in the order chosen — part of the layout, not of the table. */
  columns: PropertyDef[];
  sort: string;
  onSort: (prop: string) => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  /** Actions that edit one property in place, keyed by that property. */
  inlineActions?: Record<string, ActionApplicability>;
  onInlineSubmit?: (action: ActionApplicability, row: ObjectInstanceResponse, value: unknown) => void;
  /** `column → id → name`, so an id column reads as the object it points at. */
  labels?: Record<string, Record<string, string>>;
}) {
  const { t } = useTranslation('explore');
  const sortState = (name: string): 'ascending' | 'descending' | 'none' => {
    const term = parseSortList(sort).find((entry) => entry.prop === name);
    if (!term) return 'none';
    return term.desc ? 'descending' : 'ascending';
  };
  const allSelected = instances.length > 0 && instances.every((row) => selected.has(row.id));
  /* Which cell is being edited, and its draft value: one at a time, because the table is a reading surface. */
  const [editing, setEditing] = useState<{ rowId: string; prop: string } | null>(null);
  const [draft, setDraft] = useState('');
  return (
    <div className="ds-table-wrap ds-table-wrap--scroll">
      <table className="ds-table object-set-table">
        <thead>
          <tr>
            <th scope="col" className="object-set-select">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                aria-label={t('objectSet.selectAll')}
              />
            </th>
            {columns.map((p) => {
              const state = sortState(p.name);
              const rank = sortRank(sort, p.name);
              return (
                <th key={p.name} aria-sort={state}>
                  <button
                    type="button"
                    className="object-set-sort"
                    onClick={() => onSort(p.name)}
                    title={t('objectSet.sortBy', { name: p.name })}
                  >
                    {p.name}
                    {state === 'ascending' ? ' ↑' : state === 'descending' ? ' ↓' : ''}
                    {rank > 1 ? (
                      <span className="object-set-sort__rank">{rank}</span>
                    ) : null}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {instances.map((row) => (
            <tr key={row.id} className={selected.has(row.id) ? 'is-selected' : undefined}>
              <td className="object-set-select">
                <input
                  type="checkbox"
                  checked={selected.has(row.id)}
                  onChange={() => onToggle(row.id)}
                  aria-label={t('objectSet.selectObject', {
                    name: String(row.data?.[columns[0]?.name ?? ''] ?? row.id),
                  })}
                />
              </td>
              {columns.map((p) => {
                const action = inlineActions?.[p.name];
                const editable =
                  action !== undefined && rowSatisfies(row.data ?? {}, action.submission_criteria);
                const isEditing = editing?.rowId === row.id && editing.prop === p.name;
                if (editable && isEditing) {
                  return (
                    <td key={p.name} className="object-set-inline">
                      <input
                        className="ds-control ds-control--compact"
                        autoFocus
                        value={draft}
                        aria-label={t('objectSet.inlineEdit', { name: p.name })}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') setEditing(null);
                          if (event.key === 'Enter') {
                            onInlineSubmit?.(action, row, coerce(draft, row.data?.[p.name]));
                            setEditing(null);
                          }
                        }}
                        onBlur={() => setEditing(null)}
                      />
                    </td>
                  );
                }
                const raw = row.data?.[p.name];
                const name = labels?.[p.name]?.[String(raw ?? '')];
                return (
                  <td
                    key={p.name}
                    className={action ? 'object-set-inline' : undefined}
                    title={name ? `${name} (${String(raw)})` : undefined}
                    onDoubleClick={
                      editable
                        ? () => {
                            setEditing({ rowId: row.id, prop: p.name });
                            setDraft(String(row.data?.[p.name] ?? ''));
                          }
                        : undefined
                    }
                  >
                    <span>{name ?? cellText(raw)}</span>
                    {editable ? (
                      <button
                        type="button"
                        className="object-set-inline__edit"
                        aria-label={t('objectSet.inlineEdit', { name: p.name })}
                        onClick={() => {
                          setEditing({ rowId: row.id, prop: p.name });
                          setDraft(String(row.data?.[p.name] ?? ''));
                        }}
                      >
                        <Pencil size={12} aria-hidden />
                      </button>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
