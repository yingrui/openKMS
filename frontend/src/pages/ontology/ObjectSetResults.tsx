import { useTranslation } from 'react-i18next';
import type { ObjectInstanceResponse, PropertyDef } from '../../data/ontologyApi';
import type { ActionApplicability } from '../../data/ontologyActionsApi';
import { ObjectSetColumnPicker } from './ObjectSetColumnPicker';
import { ObjectSetResultsTable } from './ObjectSetResultsTable';

/**
 * The results perspective: which columns are shown, how they are ordered, and the rows as a table.
 *
 * The column choice belongs to the layout rather than to the table, so it is saved with the exploration: an
 * exploration that answers a question should come back answering it in the same shape.
 */
export function ObjectSetResults({
  total,
  instances,
  properties,
  visible,
  sort,
  selected,
  onSort,
  onColumns,
  onToggle,
  onToggleAll,
  inlineActions,
  onInlineSubmit,
}: {
  total: number | null;
  instances: ObjectInstanceResponse[];
  properties: PropertyDef[];
  /** Property names to show, in order. */
  visible: string[];
  sort: string;
  selected: Set<string>;
  onSort: (prop: string) => void;
  onColumns: (next: string[]) => void;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  inlineActions?: Record<string, ActionApplicability>;
  onInlineSubmit?: (action: ActionApplicability, row: ObjectInstanceResponse, value: unknown) => void;
}) {
  const { t } = useTranslation('explore');
  return (
    <>
      <div className="object-set-toolbar">
        <span className="object-set-toolbar__total">
          {total === null ? null : t('objectSet.objectCount', { count: total })}
        </span>
        <ObjectSetColumnPicker
          columns={visible}
          properties={properties.map((property) => property.name)}
          onChange={onColumns}
        />
      </div>
      <ObjectSetResultsTable
        instances={instances}
        columns={properties.filter((property) => visible.includes(property.name))}
        sort={sort}
        onSort={onSort}
        selected={selected}
        onToggle={onToggle}
        onToggleAll={onToggleAll}
        inlineActions={inlineActions}
        onInlineSubmit={onInlineSubmit}
      />
    </>
  );
}
