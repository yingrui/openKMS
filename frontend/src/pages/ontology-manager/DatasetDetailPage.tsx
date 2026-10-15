import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteDataset,
  fetchDataset,
  fetchDatasetMetadata,
  fetchDatasetRows,
  type DatasetResponse,
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

function tableLabel(d: DatasetResponse): string {
  return `${d.schema_name}.${d.table_name}`;
}

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
  const [usageObjectTypes, setUsageObjectTypes] = useState<ObjectTypeResponse[]>([]);
  const [usageLinkTypes, setUsageLinkTypes] = useState<LinkTypeResponse[]>([]);
  const [usageLoading, setUsageLoading] = useState(true);

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
      usageObjectTypes,
      usageLinkTypes,
      usageLoading,
    };
  }, [
    dataset,
    onDelete,
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
  const base = `/datasets/${datasetId}`;

  return (
    <DatasetDetailCtx.Provider value={ctx}>
      <EntityViewShell
        backTo="/datasets"
        backLabel={t('datasets.backToList')}
        title={title}
        meta={`${tableLabel(dataset)}${dataset.data_source_name ? ` · ${dataset.data_source_name}` : ''}`}
        navItems={[
          { to: base, label: t('datasets.overview'), end: true },
          { to: `${base}/data`, label: t('datasets.data') },
          { to: `${base}/columns`, label: t('datasets.columns') },
          { to: `${base}/relationships`, label: t('datasets.relationships') },
          { to: `${base}/quality`, label: t('datasets.quality') },
          { to: `${base}/settings`, label: t('datasets.settings') },
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
  const { dataset, columnCount, rowTotal, usageObjectTypes, usageLinkTypes, usageLoading } =
    useDatasetDetail();
  const empty = usageObjectTypes.length === 0 && usageLinkTypes.length === 0;
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
        <EntityViewStat
          label={t('datasets.metricColumns')}
          value={columnCount == null ? t('datasets.dash') : columnCount}
        />
        <EntityViewStat
          label={t('datasets.metricRows')}
          value={rowTotal == null ? t('datasets.dash') : rowTotal}
        />
      </EntityViewStats>
      {/* Read-only summary: everything editable lives in Settings, so this page never saves. */}
      <EntityViewPanel>
        <dl className="entity-view__dl">
          <dt>{t('datasets.dataSource')}</dt>
          <dd>{fact(`${dataset.schema_name}.${dataset.table_name}`)}{dataset.data_source_name ? ` · ${dataset.data_source_name}` : ''}</dd>
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
      {/* Who depends on this dataset — a couple of lists, not a tab of their own. */}
      <EntityViewPanel title={t('datasets.usage')} description={t('datasets.usageHint')}>
        {usageLoading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" aria-hidden />
            <p>{t('shared.loading')}</p>
          </div>
        ) : empty ? (
          <p className="entity-view__readonly">
            {t('datasets.usageEmpty')} {t('datasets.usageEmptyHint')}
          </p>
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
