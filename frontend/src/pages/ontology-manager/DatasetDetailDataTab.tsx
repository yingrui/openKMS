import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type CellContext,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Copy, Filter as FilterIcon, Loader2, Save, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  applyDatasetRows,
  fetchDatasetMetadata,
  queryDatasetRows,
  type ColumnMetadata,
  type DatasetRowFilter,
  type DatasetRowOp,
  type DatasetRowsResponse,
} from '../../data/datasetsApi';
import {
  columnKind,
  filtersFromParam,
  filtersToParam,
  newFilterRow,
  operatorDef,
  operatorsFor,
  toApiFilters,
  type FilterRow,
} from './datasetRowsFilter';
import { useDatasetDetail } from './useDatasetDetail';
import { QuickRangeSelect } from './QuickRangeSelect';
import { rangeError, rangeToValues } from './dateRange';
import { SaveFindingDialog } from './SaveFindingDialog';
import { datasetFindingDraft } from './findingDraft';
import { EntityViewHeader, EntityViewPanel } from './EntityViewShell';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const HEX_RE = /^[0-9a-fA-F]{16,}$/;

function isIdLike(value: string): boolean {
  return UUID_RE.test(value) || HEX_RE.test(value);
}

function middleTruncate(value: string, max = 22): string {
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

type RowData = Record<string, unknown>;
type Draft = Record<string, RowData>; // rowId -> { column: newValue }

function coerce(original: unknown, raw: string): unknown {
  if (typeof original === 'number') {
    const n = Number(raw);
    return raw.trim() !== '' && !Number.isNaN(n) ? n : raw;
  }
  if (typeof original === 'boolean') return raw === 'true' || raw === '1';
  return raw;
}

/** Read-only cell: id-like values truncate + copy; `title` shows the full value. */
function ReadCell({ value }: { value: unknown }) {
  const { t } = useTranslation('ontology');
  if (value === null || value === undefined) {
    return <span className="dataset-cell dataset-cell--null">{t('datasets.dash')}</span>;
  }
  if (typeof value === 'boolean') {
    return <span className="dataset-cell">{value ? t('datasets.yes') : t('datasets.no')}</span>;
  }
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const copy = () => {
    if (!navigator.clipboard) return;
    void navigator.clipboard
      .writeText(text)
      .then(() => toast.success(t('datasets.copied')))
      .catch(() => undefined);
  };
  if (!isIdLike(text)) {
    return (
      <span className="dataset-cell" title={text}>
        {text}
      </span>
    );
  }
  return (
    <span className="dataset-cell dataset-cell--id" title={text}>
      <span className="dataset-cell__text">{middleTruncate(text)}</span>
      <button
        type="button"
        className="dataset-cell__copy"
        onClick={copy}
        title={t('datasets.copy')}
        aria-label={t('datasets.copy')}
      >
        <Copy size={12} aria-hidden />
      </button>
    </span>
  );
}

function formatValue(value: unknown, t: (k: string) => string): string {
  if (value === null || value === undefined) return t('datasets.dash');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function DatasetDataTab() {
  const { t } = useTranslation('ontology');
  const { dataset } = useDatasetDetail();
  const { id: datasetId = '' } = useParams();
  const pkCols = useMemo(() => dataset.primary_key_columns ?? [], [dataset.primary_key_columns]);
  const canEdit = dataset.is_editable;

  const [params, setParams] = useSearchParams();
  const [rowsData, setRowsData] = useState<DatasetRowsResponse | null>(null);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [sorting, setSorting] = useState<SortingState>([]);
  /** The filter bar's inputs (live while typing) and the set the last query used. */
  const [filterRows, setFilterRows] = useState<FilterRow[]>(() => filtersFromParam(params.get('f')));
  const [appliedFilters, setAppliedFilters] = useState<DatasetRowFilter[]>(() =>
    toApiFilters(filtersFromParam(params.get('f'))),
  );
  const [filterColumns, setFilterColumns] = useState<ColumnMetadata[]>([]);
  const [dirty, setDirty] = useState<Draft>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!datasetId) return;
    let cancelled = false;
    void fetchDatasetMetadata(datasetId)
      .then((meta) => {
        if (cancelled) return;
        setFilterColumns(meta);
        // A column that the schema no longer has would fail every query: drop it and say so.
        const known = new Set(meta.map((c) => c.column_name));
        setFilterRows((prev) => {
          const kept = prev.filter((row) => !row.column || known.has(row.column));
          const dropped = prev.filter((row) => row.column && !known.has(row.column));
          dropped.forEach((row) => toast.info(t('datasets.filterColumnDropped', { column: row.column })));
          if (dropped.length > 0) {
            setAppliedFilters(toApiFilters(kept));
            setParams({ f: filtersToParam(kept) }, { replace: true });
          }
          return kept;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [datasetId, setParams, t]);

  /** Commit the bar: what the query sees, and what a shared URL reproduces. */
  const commitFilters = useCallback(
    (next: FilterRow[]) => {
      setFilterRows(next);
      const applied = toApiFilters(next);
      setAppliedFilters(applied);
      setPage(0);
      const search = new URLSearchParams(params);
      if (applied.length > 0) {
        search.set('f', filtersToParam(next));
      } else {
        search.delete('f');
      }
      setParams(search, { replace: true });
    },
    [params, setParams],
  );

  const loadRows = useCallback(async () => {
    if (!datasetId) return;
    setRowsLoading(true);
    try {
      const sort = sorting[0];
      setRowsData(
        await queryDatasetRows(datasetId, {
          filters: appliedFilters,
          limit: pageSize,
          offset: page * pageSize,
          sort: sort?.id ?? null,
          order: sort?.desc ? 'desc' : 'asc',
        }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadRowsFailed'));
    } finally {
      setRowsLoading(false);
    }
  }, [appliedFilters, datasetId, page, pageSize, sorting, t]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const rows = rowsData?.rows ?? [];
  const columns = rowsData?.columns ?? [];
  const total = rowsData?.total ?? 0;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

  const rowId = useCallback(
    (row: RowData, idx: number): string =>
      pkCols.length ? JSON.stringify(pkCols.map((c) => row[c])) : `__idx_${idx}`,
    [pkCols],
  );

  const rowsById = useMemo(() => {
    const map: Record<string, RowData> = {};
    rows.forEach((r, i) => {
      map[rowId(r, i)] = r;
    });
    return map;
  }, [rows, rowId]);

  const dirtyCount = useMemo(
    () => Object.values(dirty).reduce((n, changes) => n + Object.keys(changes).length, 0),
    [dirty],
  );

  const setCell = useCallback((rid: string, col: string, value: unknown) => {
    setDirty((prev) => ({ ...prev, [rid]: { ...(prev[rid] ?? {}), [col]: value } }));
  }, []);

  const cellContext = useMemo(
    () => ({ canEdit, dirty, rowId, setCell, t }),
    [canEdit, dirty, rowId, setCell, t],
  );

  const columnDefs = useMemo<ColumnDef<RowData>[]>(
    () =>
      columns.map((col) => ({
        id: col,
        accessorFn: (row) => row[col],
        header: col,
        enableSorting: true,
        cell: (ctx: CellContext<RowData, unknown>) => {
          const rid = ctx.row.id;
          const original = ctx.row.original[col];
          const changed = cellContext.dirty[rid]?.[col];
          const display = changed !== undefined ? changed : original;
          if (!cellContext.canEdit) return <ReadCell value={display} />;
          return (
            <EditableCell
              value={formatValue(display, cellContext.t)}
              dirty={changed !== undefined}
              onCommit={(raw) => cellContext.setCell(rid, col, coerce(original, raw))}
            />
          );
        },
      })),
    [columns, cellContext],
  );

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    getRowId: rowId,
    state: { sorting },
    onSortingChange: (updater) => {
      setSorting(updater);
      setPage(0);
    },
    manualSorting: true,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
  });

  const onSave = async () => {
    const ops: DatasetRowOp[] = [];
    for (const [rid, changes] of Object.entries(dirty)) {
      const row = rowsById[rid];
      if (!row) continue;
      const pk = Object.fromEntries(pkCols.map((c) => [c, row[c]]));
      const expect = Object.fromEntries(Object.keys(changes).map((c) => [c, row[c]]));
      ops.push({ op: 'update', pk, values: changes, expect });
    }
    if (ops.length === 0) return;
    setSaving(true);
    try {
      const res = await applyDatasetRows(datasetId, ops);
      toast.success(t('datasets.rowsSaved', { count: res.updated }));
      setDirty({});
      await loadRows();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.rowsSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  /** The type of a filter row's column decides which operators and inputs it gets. */
  const kindOf = (column: string) =>
    columnKind(filterColumns.find((c) => c.column_name === column)?.ontology_type);

  const opLabel = (id: string) => {
    if (id === 'contains') return t('datasets.filterOpContains');
    if (id === 'startsWith') return t('datasets.filterOpStartsWith');
    if (id === 'endsWith') return t('datasets.filterOpEndsWith');
    return id;
  };

  const patchFilter = (id: number, next: Partial<FilterRow>) =>
    filterRows.map((row) => (row.id === id ? { ...row, ...next } : row));

  const addFilter = () => {
    const nextId = filterRows.reduce((max, row) => Math.max(max, row.id), -1) + 1;
    const first = filterColumns[0]?.column_name ?? '';
    commitFilters([...filterRows, newFilterRow(nextId, first)]);
  };

  const startRow = total > 0 ? page * pageSize + 1 : 0;
  const endRow = total > 0 ? Math.min((page + 1) * pageSize, total) : 0;

  return (
    <>
      <EntityViewHeader title={t('datasets.data')} subtitle={t('datasets.dataHint')} />
      {canEdit && dirtyCount > 0 && (
        <div className="dataset-edit-bar">
          <span>{t('datasets.unsavedChanges', { count: dirtyCount })}</span>
          <div className="dataset-edit-bar__actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setDirty({})}
              disabled={saving}
            >
              <Undo2 size={14} aria-hidden />
              {t('datasets.discard')}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void onSave()}
              disabled={saving}
            >
              <Save size={14} aria-hidden />
              {saving ? t('shared.saving') : t('datasets.saveChanges')}
            </button>
          </div>
        </div>
      )}
      <EntityViewPanel>
        {rowsLoading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" aria-hidden />
            <p>{t('shared.loading')}</p>
          </div>
        ) : (
          <div className="dataset-detail-data">
            <div className="dataset-filter-bar">
              <div className="dataset-filter-bar__head">
                <span className="dataset-filter-bar__count">
                  {rowsData
                    ? `${t('datasets.filterRows', { count: rowsData.total })}${
                        appliedFilters.length > 0
                          ? ` · ${t('datasets.filterCount', { count: appliedFilters.length })}`
                          : ''
                      }${rowsData.capped ? ` · ${t('datasets.filterCapped')}` : ''}`
                    : ''}
                </span>
                <div className="dataset-filter-bar__actions">
                  <SaveFindingDialog
                    draft={datasetFindingDraft({
                      datasetId,
                      tableLabel: dataset.display_name || `${dataset.schema_name}.${dataset.table_name}`,
                      // The same filters the grid used; the finding queries its own first page.
                      query: {
                        filters: appliedFilters,
                        sort: sorting[0]?.id ?? null,
                        order: sorting[0]?.desc ? 'desc' : 'asc',
                        limit: pageSize,
                        offset: 0,
                      },
                      columns,
                      rows,
                    })}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={addFilter}
                    disabled={filterColumns.length === 0}
                  >
                    <FilterIcon size={14} aria-hidden />
                    {t('datasets.filterAdd')}
                  </button>
                  {filterRows.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => commitFilters([])}
                    >
                      {t('datasets.filterClear')}
                    </button>
                  )}
                </div>
              </div>

              {filterRows.map((row) => {
                const def = operatorDef(row.op);
                return (
                  <div key={row.id} className="dataset-filter">
                    <select
                      className="ds-control"
                      value={row.column}
                      aria-label={t('datasets.filterColumn')}
                      onChange={(e) =>
                        commitFilters(patchFilter(row.id, { column: e.target.value, value: '', value2: '' }))
                      }
                    >
                      <option value="">{t('datasets.filterColumn')}</option>
                      {filterColumns.map((c) => (
                        <option key={c.column_name} value={c.column_name}>
                          {c.column_name} · {c.data_type}
                        </option>
                      ))}
                    </select>
                    <select
                      className="ds-control dataset-filter__op"
                      value={row.op}
                      aria-label={t('datasets.filterOperator')}
                      onChange={(e) => commitFilters(patchFilter(row.id, { op: e.target.value }))}
                    >
                      {operatorsFor(kindOf(row.column)).map((op) => (
                        <option key={op.id} value={op.id}>
                          {opLabel(op.id)}
                        </option>
                      ))}
                    </select>
                    {def.values !== 'none' && (
                      <input
                        /* Remount after a commit (column/operator *or* value) so the shown value is
                           the committed one — which is also how a quick range lands in the field. */
                        key={`${row.id}:${row.column}:${row.op}:1:${row.value}`}
                        className="ds-control dataset-filter__value"
                        type={kindOf(row.column) === 'number' ? 'number' : kindOf(row.column) === 'date' ? 'date' : 'text'}
                        aria-label={t('datasets.filterValue')}
                        placeholder={def.values === 'list' ? t('datasets.filterListPlaceholder') : undefined}
                        defaultValue={row.value}
                        onBlur={(e) => commitFilters(patchFilter(row.id, { value: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            commitFilters(patchFilter(row.id, { value: (e.target as HTMLInputElement).value }));
                          }
                        }}
                      />
                    )}
                    {kindOf(row.column) === 'date' && rangeError({ from: row.value, to: row.value2 }) && (
                      <p className="page-subtitle--error">{t('datasets.filterRangeInvalid')}</p>
                    )}
                    {kindOf(row.column) === 'date' && row.op !== 'isNull' && row.op !== 'isNotNull' && (
                      <QuickRangeSelect
                        ariaLabel={t('datasets.filterQuickRange')}
                        onPick={(range) => commitFilters(patchFilter(row.id, rangeToValues(range)))}
                      />
                    )}
                    {def.values === 'two' && (
                      <input
                        key={`${row.id}:${row.column}:${row.op}:2:${row.value2}`}
                        className="ds-control dataset-filter__value"
                        type={kindOf(row.column) === 'date' ? 'date' : 'text'}
                        aria-label={t('datasets.filterTo')}
                        placeholder={t('datasets.filterTo')}
                        defaultValue={row.value2}
                        onBlur={(e) => commitFilters(patchFilter(row.id, { value2: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            commitFilters(patchFilter(row.id, { value2: (e.target as HTMLInputElement).value }));
                          }
                        }}
                      />
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      aria-label={t('datasets.filterRemove')}
                      onClick={() => commitFilters(filterRows.filter((r) => r.id !== row.id))}
                    >
                      <X size={14} aria-hidden />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="ds-table-wrap ds-table-wrap--flush ds-table-wrap--scroll">
              <table className="console-table dataset-data-table">
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id}>
                      {hg.headers.map((header) => {
                        const sorted = header.column.getIsSorted();
                        return (
                          <th key={header.id}>
                            <button
                              type="button"
                              className="dataset-th-sort"
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {sorted === 'asc' ? (
                                <ArrowUp size={12} aria-hidden />
                              ) : sorted === 'desc' ? (
                                <ArrowDown size={12} aria-hidden />
                              ) : (
                                <ArrowUpDown size={12} className="dataset-th-sort__idle" aria-hidden />
                              )}
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length || 1} className="console-table-empty">
                        {appliedFilters.length > 0 ? (
                          <span className="dataset-filter-empty">
                            {t('datasets.filterNoMatch')}
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => commitFilters([])}
                            >
                              {t('datasets.filterClear')}
                            </button>
                          </span>
                        ) : (
                          t('datasets.emptyRows')
                        )}
                      </td>
                    </tr>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <tr key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {rowsData && (
              <div className="dataset-detail-pagination">
                <div className="dataset-detail-pagination__info">
                  <span>{t('datasets.paginationRange', { start: startRow, end: endRow, total })}</span>
                  <label>
                    <span>{t('datasets.pageSize')}</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(0);
                      }}
                      disabled={rowsLoading}
                    >
                      {[25, 50, 100, 200, 500].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {totalPages > 1 && (
                  <div className="dataset-detail-pagination__btns">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setPage(0)}
                      disabled={page === 0 || rowsLoading}
                      title={t('datasets.firstPage')}
                    >
                      «
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0 || rowsLoading}
                    >
                      {t('datasets.previous')}
                    </button>
                    <span className="dataset-detail-pagination__page">
                      {t('datasets.pageOf', { current: page + 1, total: totalPages })}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1 || rowsLoading}
                    >
                      {t('datasets.next')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setPage(totalPages - 1)}
                      disabled={page >= totalPages - 1 || rowsLoading}
                      title={t('datasets.lastPage')}
                    >
                      »
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </EntityViewPanel>
    </>
  );
}

function EditableCell({
  value,
  dirty,
  onCommit,
}: {
  value: string;
  dirty: boolean;
  onCommit: (raw: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        className="dataset-cell-input"
        autoFocus
        defaultValue={value}
        onBlur={(e) => {
          onCommit(e.target.value);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onCommit((e.target as HTMLInputElement).value);
            setEditing(false);
          } else if (e.key === 'Escape') {
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className={`dataset-cell dataset-cell--editable${dirty ? ' dataset-cell--dirty' : ''}`}
      title={value}
      onClick={() => setEditing(true)}
    >
      {value}
    </button>
  );
}
