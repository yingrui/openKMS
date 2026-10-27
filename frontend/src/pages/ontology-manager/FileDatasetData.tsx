import { useEffect, useState } from 'react';
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
import { formatCell } from './datasetCellFormat';

/**
 * The **Data** tab of a file dataset: **a sample**, not a query builder.
 *
 * A table dataset's grid is built for filtering and paging through everything; a file dataset's data is meant to be
 * *taken* — downloaded as a version — not browsed. So this shows the newest published version and the first rows of
 * it, and says plainly where the rest lives. Anything more was a query UI nobody asked for.
 */
export function FileDatasetData({ datasetId }: { datasetId: string }) {
  const { t } = useTranslation('ontology');
  const [version, setVersion] = useState<DatasetVersion | null>(null);
  const [rows, setRows] = useState<FileRows | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const all = await fetchDatasetVersions(datasetId);
        const published = all.filter((v) => v.status === 'published');
        const latest = published.length > 0 ? published[published.length - 1] : null;
        if (cancelled) return;
        setVersion(latest);
        if (latest) {
          const sample = await fetchFileRows(datasetId, latest.version, { limit: 50 });
          if (!cancelled) setRows(sample);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [datasetId, t]);

  if (loading) {
    return (
      <div className="console-loading">
        <Loader2 size={32} className="console-loading-spinner" aria-hidden />
        <p>{t('shared.loading')}</p>
      </div>
    );
  }

  if (version === null) {
    return (
      <>
        <EntityViewHeader title={t('datasets.data')} subtitle={t('datasets.fileDataHint')} />
        <EntityViewPanel>
          <EmptyState title={t('datasets.noPublishedVersion')} description={t('datasets.versionsHint')} />
        </EntityViewPanel>
      </>
    );
  }

  return (
    <>
      <EntityViewHeader
        title={t('datasets.data')}
        subtitle={t('datasets.fileSampleSubtitle', {
          version: version.version,
          rows: version.row_count.toLocaleString(),
        })}
      />
      <p className="page-subtitle">{t('datasets.fileSampleHint')}</p>
      <EntityViewPanel>
        {rows === null || rows.rows.length === 0 ? (
          <EmptyState title={t('datasets.emptyRows')} description={t('datasets.versionsHint')} />
        ) : (
          // The same bleed as the table grid: the card runs edge to edge in the panel, so a data view reads
          // as one control rather than a card floating inside a card.
          <div className="dataset-detail-data">
            <div className="ds-table-wrap ds-table-wrap--flush">
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
                    // Rows arrive as objects without a stable id; the index is the position in the sample.
                    <tr key={index}>
                      {rows.columns.map((c) => (
                        <td key={c}>{formatCell(row[c], t('datasets.dash'))}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
          <div className="dataset-detail-data">
            <div className="ds-table-wrap ds-table-wrap--flush">
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
          </div>
        )}
      </EntityViewPanel>
    </>
  );
}
