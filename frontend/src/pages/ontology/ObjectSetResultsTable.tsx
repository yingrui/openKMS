import { useTranslation } from 'react-i18next';
import type { ObjectInstanceResponse, PropertyDef } from '../../data/ontologyApi';

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
  properties,
  sort,
  onSort,
  selected,
  onToggle,
  onToggleAll,
}: {
  instances: ObjectInstanceResponse[];
  properties: PropertyDef[];
  sort: string;
  onSort: (prop: string) => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}) {
  const { t } = useTranslation('explore');
  const sortState = (name: string): 'ascending' | 'descending' | 'none' => {
    if (sort === name) return 'ascending';
    if (sort === `-${name}`) return 'descending';
    return 'none';
  };
  const allSelected = instances.length > 0 && instances.every((row) => selected.has(row.id));
  return (
    <div className="ds-table-wrap">
      <table className="ds-table">
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
            {properties.map((p) => {
              const state = sortState(p.name);
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
                    name: String(row.data?.[properties[0]?.name ?? ''] ?? row.id),
                  })}
                />
              </td>
              {properties.map((p) => (
                <td key={p.name}>{cellText(row.data?.[p.name])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
