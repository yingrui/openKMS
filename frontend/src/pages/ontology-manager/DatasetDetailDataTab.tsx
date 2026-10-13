import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type CellContext,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Copy, Loader2, Save, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  applyDatasetRows,
  fetchDatasetRows,
  type DatasetRowOp,
  type DatasetRowsResponse,
} from '../../data/datasetsApi';
import { useDatasetDetail } from './DatasetDetailPage';
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

  const [rowsData, setRowsData] = useState<DatasetRowsResponse | null>(null);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [dirty, setDirty] = useState<Draft>({});
  const [saving, setSaving] = useState(false);

  const loadRows = useCallback(async () => {
    if (!datasetId) return;
    setRowsLoading(true);
    try {
      const sort = sorting[0];
      setRowsData(
        await fetchDatasetRows(datasetId, {
          limit: pageSize,
          offset: page * pageSize,
          sort: sort?.id,
          order: sort?.desc ? 'desc' : 'asc',
        }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadRowsFailed'));
    } finally {
      setRowsLoading(false);
    }
  }, [datasetId, page, pageSize, sorting, t]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const rows = rowsData?.rows ?? [];
  const columns = rows[0] ? Object.keys(rows[0]) : [];
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
            <div className="ds-table-wrap ds-table-wrap--flush">
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
                        {t('datasets.emptyRows')}
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
