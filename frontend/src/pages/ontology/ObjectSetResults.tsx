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
  labels,
  shown,
  pageSize,
  onPageSize,
  onLoadMore,
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
  labels?: Record<string, Record<string, string>>;
  /** How many rows are on screen, and the way to get the next page of the same set. */
  shown: number;
  /** How many rows one page asks for; "load more" adds another page. */
  pageSize: number;
  onPageSize: (size: number) => void;
  onLoadMore: () => void;
}) {
  const { t } = useTranslation('explore');
  return (
    <>
      {/* The table's own header: what it is, and the one control that configures it. */}
      <div className="object-set-section">
        <h2 className="object-set-section__title">{t('objectSet.objectsTitle')}</h2>
        <div className="object-set-section__controls">
          <label className="object-set-page-size">
            <span>{t('objectSet.pageSize')}</span>
            <select
              className="ds-control ds-control--compact"
              value={pageSize}
              onChange={(event) => onPageSize(Number(event.target.value))}
            >
              {[50, 100, 200, 500].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <ObjectSetColumnPicker
            columns={visible}
            properties={properties.map((property) => property.name)}
            onChange={onColumns}
          />
        </div>
      </div>
      <ObjectSetResultsTable
        instances={instances}
        columns={
          /* The chosen order is the order: filtering properties by membership quietly re-sorted them by declaration. */
          visible
            .map((name) => properties.find((property) => property.name === name))
            .filter((property): property is PropertyDef => property !== undefined)
        }
        sort={sort}
        onSort={onSort}
        selected={selected}
        onToggle={onToggle}
        onToggleAll={onToggleAll}
        inlineActions={inlineActions}
        onInlineSubmit={onInlineSubmit}
        labels={labels}
      />
      {/* Paging belongs after the rows it pages through. */}
      {total !== null && total > shown ? (
        <div className="object-set-more">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onLoadMore}>
            {t('objectSet.loadMore', { shown, total })}
          </button>
        </div>
      ) : null}
    </>
  );
}
