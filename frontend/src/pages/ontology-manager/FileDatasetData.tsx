import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchDatasetVersions,
  fetchFileRows,
  type DatasetVersion,
  type FileRows,
} from '../../data/datasetVersionsApi';
import { EmptyState, Pagination } from '../../styles/design-system';
import { EntityViewHeader, EntityViewPanel } from './EntityViewShell';
import { DatasetColumnsTab } from './DatasetColumnsTab';
import { DatasetDataTab } from './DatasetDetailDataTab';
import { useDatasetDetail } from './useDatasetDetail';

/** A published version, its row count, and the slice the reader is looking at. */
function useFileRows(datasetId: string) {
  const { t } = useTranslation('ontology');
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [version, setVersion] = useState<number | null>(null);
  const [rows, setRows] = useState<FileRows | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  /** The form's dates, and the window the last query used — typing does not read the files. */
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [window, setWindow] = useState<{ start?: string; end?: string }>({});

  const published = useMemo(
    () => versions.filter((v) => v.status === 'published'),
    [versions],
  );

  useEffect(() => {
    let cancelled = false;
    void fetchDatasetVersions(datasetId)
      .then((all) => {
        if (cancelled) return;
        setVersions(all);
        const open = all.filter((v) => v.status === 'published');
        setVersion(open.length > 0 ? open[open.length - 1].version : null);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : t('datasets.loadFailed')))
      .finally(() => {
        if (!cancelled) setLoadingVersions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId, t]);

  const load = useCallback(async () => {
    if (version === null) {
      setRows(null);
      return;
    }
    setLoadingRows(true);
    try {
      setRows(
        await fetchFileRows(datasetId, version, {
          start: window.start,
          end: window.end,
          limit: pageSize,
          offset: page * pageSize,
        }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    } finally {
      setLoadingRows(false);
    }
  }, [datasetId, version, page, pageSize, window, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const query = () => {
    setWindow({ start: draftStart || undefined, end: draftEnd || undefined });
    setPage(0);
  };

  const selected = versions.find((v) => v.version === version) ?? null;
  return {
    t,
    published,
    version,
    setVersion: (next: number) => {
      setVersion(next);
      setPage(0);
    },
    selected,
    rows,
    loading: loadingVersions || loadingRows,
    loadingVersions,
    page,
    setPage,
    pageSize,
    setPageSize,
    draftStart,
    draftEnd,
    setDraftStart,
    setDraftEnd,
    query,
  };
}

/**
 * The **Data** tab of a file dataset: the same question a table dataset's grid answers, with the same chrome.
 *
 * The reader is different — `…/{version}/rows` selects columns and a date window out of parquet/CSV, no SQL, no
 * join — and the controls follow the app's list grammar: the filters in a toolbar, the rows in a card, the pager
 * inside that card. The query is a form: pressing Query (or Enter) reads the files, typing does not.
 */
export function FileDatasetData({ datasetId }: { datasetId: string }) {
  const view = useFileRows(datasetId);
  const { t } = view;

  if (view.loadingVersions) return <Loader2 size={20} className="spin" aria-hidden />;

  if (view.published.length === 0) {
    return (
      <>
        <EntityViewHeader title={t('datasets.data')} subtitle={t('datasets.fileDataHint')} />
        <EntityViewPanel>
          <EmptyState title={t('datasets.noPublishedVersion')} description={t('datasets.versionsHint')} />
        </EntityViewPanel>
      </>
    );
  }

  const total = view.selected?.row_count ?? 0;
  const rows = view.rows;

  return (
    <>
      <EntityViewHeader title={t('datasets.data')} subtitle={t('datasets.fileDataHint')} />
      <div className="console-datasets-toolbar">
        <label className="console-datasets-filter">
          {t('datasets.version')}
          {/* ds-control-exempt: `.console-datasets-filter` styles this select (its own sheet) */}
          <select
            value={view.version ?? ''}
            onChange={(e) => view.setVersion(Number(e.target.value))}
          >
            {view.published.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version} · {v.row_count.toLocaleString()} {t('datasets.versionRows')}
              </option>
            ))}
          </select>
        </label>
        <label className="console-datasets-filter">
          {t('datasets.filterFrom')}
          <input
            type="date"
            className="ds-control"
            value={view.draftStart}
            onChange={(e) => view.setDraftStart(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') view.query();
            }}
          />
        </label>
        <label className="console-datasets-filter">
          {t('datasets.filterTo')}
          <input
            type="date"
            className="ds-control"
            value={view.draftEnd}
            onChange={(e) => view.setDraftEnd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') view.query();
            }}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={view.query}
          disabled={view.loading}
        >
          <Search size={16} aria-hidden />
          {t('datasets.query')}
        </button>
      </div>

      <EntityViewPanel>
        {rows === null ? (
          <p className="page-subtitle">
            <Loader2 size={16} className="spin" aria-hidden /> {t('shared.loading')}
          </p>
        ) : rows.rows.length === 0 ? (
          <EmptyState
            title={t('datasets.filterNoMatch')}
            description={t('datasets.fileRowsScanned', {
              rows: rows.total_scanned.toLocaleString(),
              count: 0,
            })}
          />
        ) : (
          <div className="ds-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  {rows.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.rows.map((row, index) => (
                  // Rows arrive as objects without a stable id; the index is the position in the slice.
                  <tr key={index}>
                    {rows.columns.map((c) => (
                      <td key={c}>{row[c] == null ? t('datasets.dash') : String(row[c])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              total={total}
              page={view.page}
              pageSize={view.pageSize}
              loading={view.loading}
              onPageChange={view.setPage}
              onPageSizeChange={(size) => {
                view.setPageSize(size);
                view.setPage(0);
              }}
            />
          </div>
        )}
      </EntityViewPanel>
    </>
  );
}

/** The `/data` route: the same tab, two readers — SQL over a table, or a version's files. */
export function DatasetDataRoute() {
  const { dataset } = useDatasetDetail();
  return dataset.kind === 'file' ? <FileDatasetData datasetId={dataset.id} /> : <DatasetDataTab />;
}

/** The `/columns` route: a SQL source's metadata, or the schema a version recorded. */
export function DatasetColumnsRoute() {
  const { dataset } = useDatasetDetail();
  return dataset.kind === 'file' ? <FileDatasetColumns datasetId={dataset.id} /> : <DatasetColumnsTab />;
}

function FileDatasetColumns({ datasetId }: { datasetId: string }) {
  const { dataset } = useDatasetDetail();
  const { t } = useTranslation('ontology');
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchDatasetVersions(datasetId)
      .then((all) => {
        if (cancelled) return;
        setVersions(all);
        setVersion(all.length > 0 ? all[all.length - 1].version : null);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : t('datasets.loadFailed')))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId, t]);

  if (loading) return <Loader2 size={20} className="spin" aria-hidden />;

  const selected = versions.find((v) => v.version === version) ?? null;
  void dataset;

  return (
    <>
      <EntityViewHeader
        title={t('datasets.columns')}
        subtitle={t('datasets.fileColumnsHint')}
        actions={
          versions.length > 0 ? (
            <label className="console-datasets-filter">
              {t('datasets.version')}
              {/* ds-control-exempt: `.console-datasets-filter` styles this select (its own sheet) */}
              <select value={version ?? ''} onChange={(e) => setVersion(Number(e.target.value))}>
                {[...versions].reverse().map((v) => (
                  <option key={v.version} value={v.version}>
                    v{v.version}
                  </option>
                ))}
              </select>
            </label>
          ) : undefined
        }
      />
      <EntityViewPanel>
        {!selected || selected.columns.length === 0 ? (
          <EmptyState title={t('datasets.noVersions')} description={t('datasets.versionsHint')} />
        ) : (
          <div className="ds-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('datasets.colName')}</th>
                  <th>{t('datasets.colType')}</th>
                </tr>
              </thead>
              <tbody>
                {selected.columns.map((column) => (
                  <tr key={column.name}>
                    <td>{column.name}</td>
                    <td>{column.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </EntityViewPanel>
    </>
  );
}
