import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link, Navigate, Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteDataset,
  fetchDataset,
  fetchDatasetMetadata,
  fetchDatasetRows,
  updateDataset,
  type ColumnMetadata,
  type DatasetResponse,
  type DatasetRowsResponse,
} from '../../data/datasetsApi';
import {
  fetchLinkTypes,
  fetchObjectTypes,
  type LinkTypeResponse,
  type ObjectTypeResponse,
} from '../../data/ontologyApi';
import { ResourceSharePanel } from '../../components/ResourceSharePanel';
import { RESOURCE_TYPES } from '../../data/resourceAclApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { EmptyState } from '../../styles/design-system';
import {
  EntityViewField,
  EntityViewHeader,
  EntityViewLoading,
  EntityViewPanel,
  EntityViewShell,
  EntityViewStat,
  EntityViewStats,
} from './EntityViewShell';
import '../ontology/ontology-admin.scss';
import './dataset-detail.scss';

type DatasetDetailContext = {
  dataset: DatasetResponse;
  displayName: string;
  setDisplayName: (v: string) => void;
  saving: boolean;
  onSave: () => Promise<void>;
  columnCount: number | null;
  rowTotal: number | null;
  usageObjectTypes: ObjectTypeResponse[];
  usageLinkTypes: LinkTypeResponse[];
  usageLoading: boolean;
};

const DatasetDetailCtx = createContext<DatasetDetailContext | null>(null);

function useDatasetDetail(): DatasetDetailContext {
  const ctx = useContext(DatasetDetailCtx);
  if (!ctx) throw new Error('useDatasetDetail requires DatasetDetailPage');
  return ctx;
}

function tableLabel(d: DatasetResponse): string {
  return `${d.schema_name}.${d.table_name}`;
}

export function DatasetDetailPage() {
  const { t } = useTranslation('ontology');
  const { id: datasetId = '' } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [dataset, setDataset] = useState<DatasetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [columnCount, setColumnCount] = useState<number | null>(null);
  const [rowTotal, setRowTotal] = useState<number | null>(null);
  const [usageObjectTypes, setUsageObjectTypes] = useState<ObjectTypeResponse[]>([]);
  const [usageLinkTypes, setUsageLinkTypes] = useState<LinkTypeResponse[]>([]);
  const [usageLoading, setUsageLoading] = useState(true);

  const load = useCallback(async () => {
    if (!datasetId) return;
    setLoading(true);
    try {
      const d = await fetchDataset(datasetId);
      setDataset(d);
      setDisplayName(d.display_name ?? '');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
      setDataset(null);
    } finally {
      setLoading(false);
    }
  }, [datasetId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!datasetId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [meta, rows] = await Promise.all([
          fetchDatasetMetadata(datasetId),
          fetchDatasetRows(datasetId, { limit: 1, offset: 0 }),
        ]);
        if (cancelled) return;
        setColumnCount(meta.length);
        setRowTotal(rows.total);
      } catch {
        if (!cancelled) {
          setColumnCount(null);
          setRowTotal(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  useEffect(() => {
    if (!datasetId) return;
    let cancelled = false;
    setUsageLoading(true);
    void (async () => {
      try {
        const [otRes, ltRes] = await Promise.all([fetchObjectTypes(), fetchLinkTypes()]);
        if (cancelled) return;
        setUsageObjectTypes(otRes.items.filter((ot) => ot.dataset_id === datasetId));
        setUsageLinkTypes(ltRes.items.filter((lt) => lt.dataset_id === datasetId));
      } catch {
        if (!cancelled) {
          setUsageObjectTypes([]);
          setUsageLinkTypes([]);
        }
      } finally {
        if (!cancelled) setUsageLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  const onSave = useCallback(async () => {
    if (!datasetId || !dataset) return;
    setSaving(true);
    try {
      const updated = await updateDataset(datasetId, {
        display_name: displayName.trim() || null,
      });
      setDataset(updated);
      setDisplayName(updated.display_name ?? '');
      toast.success(t('datasets.saved'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [dataset, datasetId, displayName, t]);

  const onDelete = useCallback(async () => {
    if (!datasetId || !dataset) return;
    const name = dataset.display_name?.trim() || tableLabel(dataset);
    if (
      !(await confirm({
        title: t('shared.delete'),
        message: t('datasets.deleteConfirmNamed', { name }),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    try {
      await deleteDataset(datasetId);
      toast.success(t('datasets.deleted'));
      navigate('/ontology-manager/datasets');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.deleteFailed'));
    }
  }, [confirm, dataset, datasetId, navigate, t]);

  const ctx = useMemo<DatasetDetailContext | null>(() => {
    if (!dataset) return null;
    return {
      dataset,
      displayName,
      setDisplayName,
      saving,
      onSave,
      columnCount,
      rowTotal,
      usageObjectTypes,
      usageLinkTypes,
      usageLoading,
    };
  }, [
    dataset,
    displayName,
    saving,
    onSave,
    columnCount,
    rowTotal,
    usageObjectTypes,
    usageLinkTypes,
    usageLoading,
  ]);

  if (loading || !dataset || !ctx) {
    return <EntityViewLoading label={t('shared.loading')} />;
  }

  const title = dataset.display_name?.trim() || tableLabel(dataset);
  const base = `/ontology-manager/datasets/${datasetId}`;

  return (
    <DatasetDetailCtx.Provider value={ctx}>
      <EntityViewShell
        backTo="/ontology-manager/datasets"
        backLabel={t('datasets.backToList')}
        kind={t('datasets.kind')}
        title={title}
        meta={`${tableLabel(dataset)}${dataset.data_source_name ? ` · ${dataset.data_source_name}` : ''}`}
        toolbar={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => void onDelete()}>
              <Trash2 size={16} aria-hidden />
              {t('shared.delete')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void onSave()}
              disabled={saving}
            >
              <Save size={16} aria-hidden />
              {saving ? t('shared.saving') : t('shared.save')}
            </button>
          </>
        }
        navItems={[
          { to: base, label: t('datasets.overview'), end: true },
          { to: `${base}/data`, label: t('datasets.data') },
          { to: `${base}/columns`, label: t('datasets.columns') },
          { to: `${base}/usage`, label: t('datasets.usage') },
          { to: `${base}/sharing`, label: t('datasets.sharing') },
        ]}
      >
        <Outlet />
      </EntityViewShell>
    </DatasetDetailCtx.Provider>
  );
}

export function DatasetOverviewTab() {
  const { t } = useTranslation('ontology');
  const {
    dataset,
    displayName,
    setDisplayName,
    columnCount,
    rowTotal,
    usageObjectTypes,
    usageLinkTypes,
  } = useDatasetDetail();
  const label = tableLabel(dataset);

  return (
    <>
      <EntityViewHeader title={t('datasets.overview')} subtitle={t('datasets.overviewHint')} />
      <EntityViewStats>
        <EntityViewStat
          label={t('datasets.metricColumns')}
          value={columnCount == null ? t('datasets.dash') : columnCount}
        />
        <EntityViewStat
          label={t('datasets.metricRows')}
          value={rowTotal == null ? t('datasets.dash') : rowTotal}
        />
        <EntityViewStat
          label={t('datasets.metricUsage')}
          value={usageObjectTypes.length + usageLinkTypes.length}
        />
      </EntityViewStats>
      <EntityViewPanel>
        <div className="entity-view__form">
          <EntityViewField label={t('datasets.displayName')}>
            <input
              className="console-form-control"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={label}
            />
          </EntityViewField>
          <EntityViewField label={t('datasets.schemaTable')}>
            <p className="entity-view__readonly">{label}</p>
          </EntityViewField>
          <EntityViewField label={t('datasets.dataSource')}>
            <p className="entity-view__readonly">{dataset.data_source_name ?? t('datasets.dash')}</p>
          </EntityViewField>
        </div>
      </EntityViewPanel>
    </>
  );
}

export function DatasetDataTab() {
  const { t } = useTranslation('ontology');
  const { id: datasetId = '' } = useParams();
  const [rowsData, setRowsData] = useState<DatasetRowsResponse | null>(null);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);

  const displayCellValue = useCallback(
    (v: unknown): string => {
      if (v === null || v === undefined) return t('datasets.dash');
      if (typeof v === 'boolean') return v ? t('datasets.yes') : t('datasets.no');
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    },
    [t],
  );

  const loadRows = useCallback(async () => {
    if (!datasetId) return;
    setRowsLoading(true);
    try {
      setRowsData(
        await fetchDatasetRows(datasetId, {
          limit: pageSize,
          offset: page * pageSize,
        }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadRowsFailed'));
    } finally {
      setRowsLoading(false);
    }
  }, [datasetId, page, pageSize, t]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const columns = rowsData?.rows?.[0] ? Object.keys(rowsData.rows[0]) : [];
  const total = rowsData?.total ?? 0;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;
  const startRow = total > 0 ? page * pageSize + 1 : 0;
  const endRow = total > 0 ? Math.min((page + 1) * pageSize, total) : 0;

  return (
    <>
      <EntityViewHeader title={t('datasets.data')} subtitle={t('datasets.dataHint')} />
      <EntityViewPanel>
        {rowsLoading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" aria-hidden />
            <p>{t('shared.loading')}</p>
          </div>
        ) : (
          <div className="dataset-detail-data">
            <div className="ds-table-wrap ds-table-wrap--flush">
              <table className="console-table">
                <thead>
                  <tr>
                    {columns.map((col) => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {!rowsData?.rows?.length ? (
                    <tr>
                      <td colSpan={columns.length || 1} className="console-table-empty">
                        {t('datasets.emptyRows')}
                      </td>
                    </tr>
                  ) : (
                    rowsData.rows.map((row, idx) => (
                      <tr key={idx}>
                        {columns.map((col) => (
                          <td key={col}>{displayCellValue(row[col])}</td>
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
                  <span>
                    {t('datasets.paginationRange', { start: startRow, end: endRow, total })}
                  </span>
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

export function DatasetColumnsTab() {
  const { t } = useTranslation('ontology');
  const { id: datasetId = '' } = useParams();
  const [metadata, setMetadata] = useState<ColumnMetadata[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!datasetId) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const cols = await fetchDatasetMetadata(datasetId);
        if (!cancelled) setMetadata(cols);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : t('datasets.loadColumnsFailed'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [datasetId, t]);

  return (
    <>
      <EntityViewHeader title={t('datasets.columns')} subtitle={t('datasets.columnsHint')} />
      <EntityViewPanel>
        {loading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" aria-hidden />
            <p>{t('shared.loading')}</p>
          </div>
        ) : (
          <div className="ds-table-wrap ds-table-wrap--flush">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('datasets.colColumn')}</th>
                  <th>{t('datasets.colDataType')}</th>
                  <th>{t('datasets.colNullable')}</th>
                  <th>{t('datasets.colPosition')}</th>
                </tr>
              </thead>
              <tbody>
                {metadata.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="console-table-empty">
                      {t('datasets.emptyColumns')}
                    </td>
                  </tr>
                ) : (
                  metadata.map((col) => (
                    <tr key={col.column_name}>
                      <td>
                        <strong>{col.column_name}</strong>
                      </td>
                      <td>{col.data_type}</td>
                      <td>{col.is_nullable ? t('datasets.yes') : t('datasets.no')}</td>
                      <td>{col.ordinal_position}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </EntityViewPanel>
    </>
  );
}

export function DatasetUsageTab() {
  const { t } = useTranslation('ontology');
  const { usageObjectTypes, usageLinkTypes, usageLoading } = useDatasetDetail();
  const empty = usageObjectTypes.length === 0 && usageLinkTypes.length === 0;

  return (
    <>
      <EntityViewHeader title={t('datasets.usage')} subtitle={t('datasets.usageHint')} />
      <EntityViewPanel>
        {usageLoading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" aria-hidden />
            <p>{t('shared.loading')}</p>
          </div>
        ) : empty ? (
          <EmptyState
            title={t('datasets.usageEmpty')}
            description={t('datasets.usageEmptyHint')}
            action={
              <Link to="/ontology-manager/object-types" className="btn btn-secondary">
                {t('datasets.browseObjectTypes')}
              </Link>
            }
          />
        ) : (
          <div className="dataset-detail-usage">
            {usageObjectTypes.length > 0 && (
              <section>
                <h3 className="dataset-detail-usage__heading">{t('datasets.usageObjectTypes')}</h3>
                <ul className="dataset-detail-usage__list">
                  {usageObjectTypes.map((ot) => (
                    <li key={ot.id}>
                      <Link to={`/ontology-manager/object-types/${ot.id}`}>{ot.name}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {usageLinkTypes.length > 0 && (
              <section>
                <h3 className="dataset-detail-usage__heading">{t('datasets.usageLinkTypes')}</h3>
                <ul className="dataset-detail-usage__list">
                  {usageLinkTypes.map((lt) => (
                    <li key={lt.id}>
                      <Link to={`/ontology-manager/link-types/${lt.id}`}>{lt.name}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </EntityViewPanel>
    </>
  );
}

export function DatasetSharingTab() {
  const { t } = useTranslation('ontology');
  const { id: datasetId = '' } = useParams();

  return (
    <>
      <EntityViewHeader title={t('datasets.sharing')} subtitle={t('datasets.sharingHint')} />
      <EntityViewPanel>
        {datasetId ? (
          <ResourceSharePanel
            resourceType={RESOURCE_TYPES.dataset}
            resourceId={datasetId}
            title={t('datasets.sharing')}
          />
        ) : null}
      </EntityViewPanel>
    </>
  );
}

/** Legacy settings URL → overview or sharing. */
export function DatasetSettingsRedirect() {
  const { id: datasetId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  const target =
    tab === 'sharing'
      ? `/ontology-manager/datasets/${datasetId}/sharing`
      : `/ontology-manager/datasets/${datasetId}`;
  return <Navigate to={target} replace />;
}
