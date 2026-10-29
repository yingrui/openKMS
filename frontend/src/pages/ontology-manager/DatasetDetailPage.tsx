import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteDataset,
  fetchDataset,
  fetchDatasetMetadata,
  queryDatasetRows,
  type DatasetResponse,
} from '../../data/datasetsApi';
import { ResourceSharePanel } from '../../components/ResourceSharePanel';
import { RESOURCE_TYPES } from '../../data/resourceAclApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import {
  EntityViewHeader,
  EntityViewLoading,
  EntityViewPanel,
  EntityViewShell,
  EntityViewStat,
  EntityViewStats,
} from './EntityViewShell';
import {
  DatasetDetailCtx,
  useDatasetDetail,
  type DatasetDetailContext,
} from './useDatasetDetail';
import '../ontology/ontology-admin.scss';
import './dataset-detail.scss';
import { datasetLabel } from './datasetLabel';
import { fetchDatasetVersions } from '../../data/datasetVersionsApi';


/** Sensitivity is stored as a stable value; the summary shows its label. */
const SENSITIVITY_KEYS: Record<string, string> = {
  public: 'datasets.sensitivityPublic',
  internal: 'datasets.sensitivityInternal',
  confidential: 'datasets.sensitivityConfidential',
  restricted: 'datasets.sensitivityRestricted',
};

export function DatasetDetailPage() {
  const { t } = useTranslation('ontology');
  const { id: datasetId = '' } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [dataset, setDataset] = useState<DatasetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [columnCount, setColumnCount] = useState<number | null>(null);
  const [rowTotal, setRowTotal] = useState<number | null>(null);
  const [versionCount, setVersionCount] = useState<number | null>(null);
  const [fileCount, setFileCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!datasetId) return;
    setLoading(true);
    try {
      setDataset(await fetchDataset(datasetId));
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
    if (!datasetId || dataset?.kind !== 'table') return;
    let cancelled = false;
    void (async () => {
      try {
        const [meta, rows] = await Promise.all([
          fetchDatasetMetadata(datasetId),
          queryDatasetRows(datasetId, { limit: 1 }),
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
  }, [datasetId, dataset?.kind]);

  // What a file dataset *is*: versions of files, not columns of rows.
  useEffect(() => {
    if (!datasetId || dataset?.kind !== 'file') return;
    let cancelled = false;
    void (async () => {
      try {
        const versions = await fetchDatasetVersions(datasetId);
        if (cancelled) return;
        setVersionCount(versions.length);
        const published = versions.find((v) => v.status === 'published') ?? versions[0];
        setFileCount(published ? published.file_count : 0);
      } catch {
        if (!cancelled) {
          setVersionCount(null);
          setFileCount(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [datasetId, dataset?.kind]);

  const onDelete = useCallback(async () => {
    if (!datasetId || !dataset) return;
    const name = dataset.display_name?.trim() || datasetLabel(dataset);
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
      navigate('/datasets');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.deleteFailed'));
    }
  }, [confirm, dataset, datasetId, navigate, t]);

  const ctx = useMemo<DatasetDetailContext | null>(() => {
    if (!dataset) return null;
    return {
      dataset,
      setDataset,
      onDelete,
      columnCount,
      rowTotal,
      versionCount,
      fileCount,
    };
  }, [
    dataset,
    onDelete,
    columnCount,
    rowTotal,
    versionCount,
    fileCount,
  ]);

  if (loading || !dataset || !ctx) {
    return <EntityViewLoading label={t('shared.loading')} />;
  }

  const title = dataset.display_name?.trim() || datasetLabel(dataset);
  const base = `/datasets/${datasetId}`;

  return (
    <DatasetDetailCtx.Provider value={ctx}>
      <EntityViewShell
        backTo="/datasets"
        backLabel={t('datasets.backToList')}
        title={title}
        meta={
          dataset.kind === 'file'
            ? (dataset.data_source_name ?? 'Object storage')
            : `${datasetLabel(dataset)}${dataset.data_source_name ? ` · ${dataset.data_source_name}` : ''}`
        }
        navItems={
          dataset.kind === 'file'
            ? [
                { to: base, label: t('datasets.overview'), end: true },
                { to: `${base}/data`, label: t('datasets.data') },
                { to: `${base}/versions`, label: t('datasets.versions') },
                { to: `${base}/columns`, label: t('datasets.columns') },
                { to: `${base}/settings`, label: t('datasets.settings') },
                { to: `${base}/sharing`, label: t('datasets.sharing') },
              ]
            : [
                { to: base, label: t('datasets.overview'), end: true },
                { to: `${base}/data`, label: t('datasets.data') },
                { to: `${base}/columns`, label: t('datasets.columns') },
                { to: `${base}/relationships`, label: t('datasets.relationships') },
                { to: `${base}/quality`, label: t('datasets.quality') },
                { to: `${base}/settings`, label: t('datasets.settings') },
                { to: `${base}/sharing`, label: t('datasets.sharing') },
              ]
        }
      >
        <Outlet />
      </EntityViewShell>
    </DatasetDetailCtx.Provider>
  );
}

export function DatasetOverviewTab() {
  const { t } = useTranslation('ontology');
  const { dataset, columnCount, rowTotal, versionCount, fileCount } = useDatasetDetail();
  const sensitivity = SENSITIVITY_KEYS[dataset.sensitivity ?? ''] ?? t('datasets.sensitivityNone');
  const fact = (value: string | number | null | undefined) =>
    value === null || value === undefined || value === '' ? t('datasets.dash') : value;

  return (
    <>
      <EntityViewHeader
        title={t('datasets.overview')}
        subtitle={t('datasets.overviewHint')}
        actions={
          <Link className="btn btn-secondary" to={`/datasets/${dataset.id}/settings`}>
            <Pencil size={16} aria-hidden />
            {t('datasets.editInSettings')}
          </Link>
        }
      />
      <EntityViewStats>
        {dataset.kind === 'file' ? (
          <>
            {/* A file dataset has no columns and no single row count; its shape is versions of files. */}
            <EntityViewStat
              label={t('datasets.metricVersions')}
              value={versionCount == null ? t('datasets.dash') : versionCount}
            />
            <EntityViewStat
              label={t('datasets.metricFiles')}
              value={fileCount == null ? t('datasets.dash') : fileCount}
            />
          </>
        ) : (
          <>
            <EntityViewStat
              label={t('datasets.metricColumns')}
              value={columnCount == null ? t('datasets.dash') : columnCount}
            />
            <EntityViewStat
              label={t('datasets.metricRows')}
              value={rowTotal == null ? t('datasets.dash') : rowTotal}
            />
          </>
        )}
      </EntityViewStats>
      {/* Read-only summary: everything editable lives in Settings, so this page never saves. */}
      <EntityViewPanel>
        <dl className="entity-view__dl">
          <dt>{t('datasets.dataSource')}</dt>
          <dd>
            {/* By kind, not by pipe: a file dataset has no schema.table, and `a || b` would print "null.null". */}
            {fact(
              dataset.kind === 'file'
                ? [t('datasets.fileDataset'), dataset.data_source_name].filter(Boolean).join(' · ')
                : `${dataset.schema_name}.${dataset.table_name}${
                    dataset.data_source_name ? ` · ${dataset.data_source_name}` : ''
                  }`,
            )}
          </dd>
          <dt>{t('datasets.displayName')}</dt>
          <dd>{fact(dataset.display_name)}</dd>
          <dt>{t('datasets.descriptionLabel')}</dt>
          <dd>{fact(dataset.description)}</dd>
          <dt>{t('datasets.domainLabel')}</dt>
          <dd>{fact(dataset.domain)}</dd>
          <dt>{t('datasets.tagsLabel')}</dt>
          <dd>{dataset.tags?.length ? dataset.tags.join(', ') : t('datasets.dash')}</dd>
          <dt>{t('datasets.businessDefinitionLabel')}</dt>
          <dd>{fact(dataset.business_definition)}</dd>
          <dt>{t('datasets.sensitivityLabel')}</dt>
          <dd>{sensitivity}</dd>
        </dl>
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
