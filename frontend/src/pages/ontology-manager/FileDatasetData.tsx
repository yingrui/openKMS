import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchDatasetVersions,
  fetchFileRows,
  type DatasetVersion,
  type FileRows,
} from '../../data/datasetVersionsApi';
import { EmptyState } from '../../styles/design-system';
import { EntityViewHeader, EntityViewPanel } from './EntityViewShell';
import { DatasetColumnsTab } from './DatasetColumnsTab';
import { DatasetDataTab } from './DatasetDetailDataTab';
import { useDatasetDetail } from './useDatasetDetail';

/**
 * The **Data** tab of a file dataset: the same question a table dataset's grid answers, read a different way.
 *
 * There is no SQL here and no join — `…/{version}/rows` reads parquet/CSV out of the bucket with column
 * selection and a date range, which is exactly what a file slice can honestly offer. Published versions only:
 * a draft is still moving.
 */
export function FileDatasetData({ datasetId }: { datasetId: string }) {
  const { t } = useTranslation('ontology');
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [version, setVersion] = useState<number | null>(null);
  const [rows, setRows] = useState<FileRows | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);

  const loadVersions = useCallback(async () => {
    setLoading(true);
    try {
      const all = await fetchDatasetVersions(datasetId);
      const published = all.filter((v) => v.status === 'published').map((v) => v.version);
      setVersions(all);
      setVersion(published.length > 0 ? published[published.length - 1] : null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [datasetId, t]);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  useEffect(() => {
    if (version === null) {
      setRows(null);
      return;
    }
    let cancelled = false;
    setLoadingRows(true);
    void fetchFileRows(datasetId, version, { limit: 100 })
      .then((result) => {
        if (!cancelled) setRows(result);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : t('datasets.loadFailed')))
      .finally(() => {
        if (!cancelled) setLoadingRows(false);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId, version, t]);

  if (loading) return <Loader2 size={20} className="spin" aria-hidden />;

  const published = versions.filter((v) => v.status === 'published');

  return (
    <>
      <EntityViewHeader
        title={t('datasets.data')}
        subtitle={t('datasets.fileDataHint')}
        actions={
          published.length > 0 ? (
            <label className="console-datasets-filter">
              {t('datasets.version')}
              {/* ds-control-exempt: `.console-datasets-filter` styles this select (its own sheet) */}
              <select
                value={version ?? ''}
                onChange={(e) => setVersion(Number(e.target.value))}
              >
                {published.map((v) => (
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
        {version === null ? (
          <EmptyState title={t('datasets.noPublishedVersion')} description={t('datasets.versionsHint')} />
        ) : loadingRows || rows === null ? (
          <p className="page-subtitle">
            <Loader2 size={16} className="spin" aria-hidden /> {t('shared.loading')}
          </p>
        ) : (
          <>
            <p className="page-subtitle">
              {t('datasets.fileRowsScanned', {
                rows: rows.total_scanned.toLocaleString(),
                count: rows.rows.length,
              })}
            </p>
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
            </div>
          </>
        )}
      </EntityViewPanel>
    </>
  );
}

/** The `/data` route: the same tab, two readers — SQL over a table, or a version's files. */
export function DatasetDataRoute() {
  const { dataset } = useDatasetDetail();
  return dataset.kind === 'file' ? (
    <FileDatasetData datasetId={dataset.id} />
  ) : (
    <DatasetDataTab />
  );
}

/**
 * The `/columns` route for a file dataset: the schema a version recorded when its files were read.
 *
 * The table version asks the SQL source for its columns; a bucket has no source to ask, and the API says so
 * ("Metadata only supported for PostgreSQL sources"). A version's manifest already knows its columns — that is
 * the same truth, recorded at upload instead of inferred from a table.
 */
export function DatasetColumnsRoute() {
  const { dataset } = useDatasetDetail();
  return dataset.kind === 'file' ? (
    <FileDatasetColumns datasetId={dataset.id} />
  ) : (
    <DatasetColumnsTab />
  );
}

function FileDatasetColumns({ datasetId }: { datasetId: string }) {
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
