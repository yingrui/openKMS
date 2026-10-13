import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteDataset,
  fetchDataset,
  fetchDatasetMetadata,
  fetchDatasetRows,
  updateDataset,
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
  setDataset: (d: DatasetResponse) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  domain: string;
  setDomain: (v: string) => void;
  tags: string;
  setTags: (v: string) => void;
  businessDefinition: string;
  setBusinessDefinition: (v: string) => void;
  sensitivity: string;
  setSensitivity: (v: string) => void;
  saving: boolean;
  onSave: () => Promise<void>;
  onDelete: () => Promise<void>;
  columnCount: number | null;
  rowTotal: number | null;
  usageObjectTypes: ObjectTypeResponse[];
  usageLinkTypes: LinkTypeResponse[];
  usageLoading: boolean;
};

const DatasetDetailCtx = createContext<DatasetDetailContext | null>(null);

export function useDatasetDetail(): DatasetDetailContext {
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
  const [description, setDescription] = useState('');
  const [domain, setDomain] = useState('');
  const [tags, setTags] = useState('');
  const [businessDefinition, setBusinessDefinition] = useState('');
  const [sensitivity, setSensitivity] = useState('');
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
      setDescription(d.description ?? '');
      setDomain(d.domain ?? '');
      setTags((d.tags ?? []).join(', '));
      setBusinessDefinition(d.business_definition ?? '');
      setSensitivity(d.sensitivity ?? '');
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
        description: description.trim() || null,
        domain: domain.trim() || null,
        tags: tags
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        business_definition: businessDefinition.trim() || null,
        sensitivity: sensitivity.trim() || null,
      });
      setDataset(updated);
      setDisplayName(updated.display_name ?? '');
      setDescription(updated.description ?? '');
      setDomain(updated.domain ?? '');
      setTags((updated.tags ?? []).join(', '));
      setBusinessDefinition(updated.business_definition ?? '');
      setSensitivity(updated.sensitivity ?? '');
      toast.success(t('datasets.saved'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [dataset, datasetId, displayName, description, domain, tags, businessDefinition, sensitivity, t]);

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
      displayName,
      setDisplayName,
      description,
      setDescription,
      domain,
      setDomain,
      tags,
      setTags,
      businessDefinition,
      setBusinessDefinition,
      sensitivity,
      setSensitivity,
      saving,
      onSave,
      onDelete,
      columnCount,
      rowTotal,
      usageObjectTypes,
      usageLinkTypes,
      usageLoading,
    };
  }, [
    dataset,
    displayName,
    description,
    domain,
    tags,
    businessDefinition,
    sensitivity,
    saving,
    onSave,
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
        kind={t('datasets.kind')}
        title={title}
        meta={`${tableLabel(dataset)}${dataset.data_source_name ? ` · ${dataset.data_source_name}` : ''}`}
        navItems={[
          { to: base, label: t('datasets.overview'), end: true },
          { to: `${base}/data`, label: t('datasets.data') },
          { to: `${base}/fields`, label: t('datasets.fields') },
          { to: `${base}/usage`, label: t('datasets.usage') },
          { to: `${base}/relationships`, label: t('datasets.relationships') },
          { to: `${base}/lineage`, label: t('datasets.lineage') },
          { to: `${base}/quality`, label: t('datasets.quality') },
          { to: `${base}/metrics`, label: t('datasets.metrics') },
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
  const {
    dataset,
    displayName,
    setDisplayName,
    description,
    setDescription,
    domain,
    setDomain,
    tags,
    setTags,
    businessDefinition,
    setBusinessDefinition,
    sensitivity,
    setSensitivity,
    saving,
    onSave,
    columnCount,
    rowTotal,
    usageObjectTypes,
    usageLinkTypes,
  } = useDatasetDetail();
  const label = tableLabel(dataset);

  return (
    <>
      <EntityViewHeader
        title={t('datasets.overview')}
        subtitle={t('datasets.overviewHint')}
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void onSave()}
            disabled={saving}
          >
            <Save size={16} aria-hidden />
            {saving ? t('shared.saving') : t('shared.save')}
          </button>
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
          <EntityViewField label={t('datasets.descriptionLabel')}>
            <input
              className="console-form-control"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </EntityViewField>
          <EntityViewField label={t('datasets.domainLabel')}>
            <input
              className="console-form-control"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
          </EntityViewField>
          <EntityViewField label={t('datasets.tagsLabel')}>
            <input
              className="console-form-control"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t('datasets.tagsPlaceholder')}
            />
          </EntityViewField>
          <EntityViewField label={t('datasets.businessDefinitionLabel')}>
            <textarea
              className="console-form-control"
              value={businessDefinition}
              onChange={(e) => setBusinessDefinition(e.target.value)}
            />
          </EntityViewField>
          <EntityViewField label={t('datasets.sensitivityLabel')}>
            <select
              className="console-form-control"
              value={sensitivity}
              onChange={(e) => setSensitivity(e.target.value)}
            >
              <option value="">{t('datasets.sensitivityNone')}</option>
              <option value="public">{t('datasets.sensitivityPublic')}</option>
              <option value="internal">{t('datasets.sensitivityInternal')}</option>
              <option value="confidential">{t('datasets.sensitivityConfidential')}</option>
              <option value="restricted">{t('datasets.sensitivityRestricted')}</option>
            </select>
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
