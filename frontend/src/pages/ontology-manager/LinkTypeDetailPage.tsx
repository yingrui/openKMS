import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Outlet, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  CARDINALITY_OPTIONS,
  fetchLinkType,
  fetchObjectTypes,
  updateLinkType,
  type LinkTypeResponse,
  type ObjectTypeResponse,
} from '../../data/ontologyApi';
import { fetchDatasets, fetchDatasetMetadata, type DatasetResponse } from '../../data/datasetsApi';
import { ResourceSharePanel } from '../../components/ResourceSharePanel';
import { RESOURCE_TYPES } from '../../data/resourceAclApi';
import { EntityViewLoading, EntityViewShell } from './EntityViewShell';
import '../ontology/ontology-admin.scss';

type LinkTypeDetailContext = {
  linkType: LinkTypeResponse;
  objectTypes: ObjectTypeResponse[];
  datasets: DatasetResponse[];
  datasetColumns: { column_name: string }[];
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  sourceId: string;
  setSourceId: (v: string) => void;
  targetId: string;
  setTargetId: (v: string) => void;
  cardinality: string;
  setCardinality: (v: string) => void;
  datasetId: string;
  setDatasetId: (v: string) => void;
  sourceKeyProperty: string;
  setSourceKeyProperty: (v: string) => void;
  targetKeyProperty: string;
  setTargetKeyProperty: (v: string) => void;
  sourceDatasetColumn: string;
  setSourceDatasetColumn: (v: string) => void;
  targetDatasetColumn: string;
  setTargetDatasetColumn: (v: string) => void;
  saving: boolean;
  onSave: () => Promise<void>;
};

const LinkTypeDetailCtx = createContext<LinkTypeDetailContext | null>(null);

function useLinkTypeDetail(): LinkTypeDetailContext {
  const ctx = useContext(LinkTypeDetailCtx);
  if (!ctx) throw new Error('useLinkTypeDetail requires LinkTypeDetailPage');
  return ctx;
}

export function LinkTypeDetailPage() {
  const { t } = useTranslation('ontology');
  const { linkTypeId = '' } = useParams();
  const [linkType, setLinkType] = useState<LinkTypeResponse | null>(null);
  const [objectTypes, setObjectTypes] = useState<ObjectTypeResponse[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [datasetColumns, setDatasetColumns] = useState<{ column_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [cardinality, setCardinality] = useState('one-to-many');
  const [datasetId, setDatasetId] = useState('');
  const [sourceKeyProperty, setSourceKeyProperty] = useState('');
  const [targetKeyProperty, setTargetKeyProperty] = useState('');
  const [sourceDatasetColumn, setSourceDatasetColumn] = useState('');
  const [targetDatasetColumn, setTargetDatasetColumn] = useState('');

  const applyLinkType = useCallback((lt: LinkTypeResponse) => {
    setLinkType(lt);
    setName(lt.name);
    setDescription(lt.description || '');
    setSourceId(lt.source_object_type_id);
    setTargetId(lt.target_object_type_id);
    setCardinality(lt.cardinality || 'one-to-many');
    setDatasetId(lt.dataset_id || '');
    setSourceKeyProperty(lt.source_key_property || '');
    setTargetKeyProperty(lt.target_key_property || '');
    setSourceDatasetColumn(lt.source_dataset_column || '');
    setTargetDatasetColumn(lt.target_dataset_column || '');
  }, []);

  const load = useCallback(async () => {
    if (!linkTypeId) return;
    setLoading(true);
    try {
      const [lt, objsRes, dsRes] = await Promise.all([
        fetchLinkType(linkTypeId),
        fetchObjectTypes(),
        fetchDatasets(),
      ]);
      applyLinkType(lt);
      setObjectTypes(objsRes.items);
      setDatasets(dsRes.items);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('linkTypes.loadFailed'));
      setLinkType(null);
    } finally {
      setLoading(false);
    }
  }, [linkTypeId, applyLinkType, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (cardinality === 'many-to-many' && datasetId) {
      fetchDatasetMetadata(datasetId)
        .then((cols) => setDatasetColumns(cols))
        .catch(() => setDatasetColumns([]));
    } else {
      setDatasetColumns([]);
    }
  }, [cardinality, datasetId]);

  const onSave = useCallback(async () => {
    if (!linkTypeId || !name.trim() || !sourceId || !targetId) return;
    setSaving(true);
    try {
      const updated = await updateLinkType(linkTypeId, {
        name: name.trim(),
        description: description.trim() || undefined,
        source_object_type_id: sourceId,
        target_object_type_id: targetId,
        cardinality,
        dataset_id: datasetId || undefined,
        source_key_property: sourceKeyProperty || undefined,
        target_key_property: targetKeyProperty || undefined,
        source_dataset_column: sourceDatasetColumn || undefined,
        target_dataset_column: targetDatasetColumn || undefined,
      });
      applyLinkType(updated);
      toast.success(t('linkTypes.saved'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('linkTypes.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [
    linkTypeId,
    name,
    description,
    sourceId,
    targetId,
    cardinality,
    datasetId,
    sourceKeyProperty,
    targetKeyProperty,
    sourceDatasetColumn,
    targetDatasetColumn,
    applyLinkType,
    t,
  ]);

  const value = useMemo(
    () =>
      linkType
        ? {
            linkType,
            objectTypes,
            datasets,
            datasetColumns,
            name,
            setName,
            description,
            setDescription,
            sourceId,
            setSourceId,
            targetId,
            setTargetId,
            cardinality,
            setCardinality,
            datasetId,
            setDatasetId,
            sourceKeyProperty,
            setSourceKeyProperty,
            targetKeyProperty,
            setTargetKeyProperty,
            sourceDatasetColumn,
            setSourceDatasetColumn,
            targetDatasetColumn,
            setTargetDatasetColumn,
            saving,
            onSave,
          }
        : null,
    [
      linkType,
      objectTypes,
      datasets,
      datasetColumns,
      name,
      description,
      sourceId,
      targetId,
      cardinality,
      datasetId,
      sourceKeyProperty,
      targetKeyProperty,
      sourceDatasetColumn,
      targetDatasetColumn,
      saving,
      onSave,
    ],
  );

  if (loading) {
    return <EntityViewLoading label={t('shared.loading')} />;
  }

  if (!linkType || !value) {
    return (
      <p className="ontology-admin-loading">
        {t('linkTypes.notFound')}{' '}
        <Link to="/ontology-manager/link-types">{t('linkTypes.backToList')}</Link>
      </p>
    );
  }

  const base = `/ontology-manager/link-types/${linkTypeId}`;

  return (
    <LinkTypeDetailCtx.Provider value={value}>
      <EntityViewShell
        backTo="/ontology-manager/link-types"
        backLabel={t('linkTypes.backToList')}
        title={linkType.name}
        meta={linkType.cardinality}
        navItems={[
          { to: base, label: t('linkTypes.overview'), end: true },
          { to: `${base}/datasources`, label: t('linkTypes.datasources') },
          { to: `${base}/sharing`, label: t('linkTypes.sharing') },
        ]}
      >
        <Outlet />
      </EntityViewShell>
    </LinkTypeDetailCtx.Provider>
  );
}

export function LinkTypeOverviewTab() {
  const { t } = useTranslation('ontology');
  const {
    linkType,
    objectTypes,
    name,
    setName,
    description,
    setDescription,
    sourceId,
    setSourceId,
    targetId,
    setTargetId,
    cardinality,
    setCardinality,
    sourceKeyProperty,
    setSourceKeyProperty,
    targetKeyProperty,
    setTargetKeyProperty,
    saving,
    onSave,
  } = useLinkTypeDetail();

  const sourceOt = objectTypes.find((o) => o.id === sourceId);
  const targetOt = objectTypes.find((o) => o.id === targetId);
  const sourceProps = sourceOt?.properties ?? [];
  const targetProps = targetOt?.properties ?? [];

  return (
    <>
      <header className="page-header">
        <div>
          <h1>{t('linkTypes.overview')}</h1>
          <p className="page-subtitle">{linkType.description || t('linkTypes.noDescription')}</p>
        </div>
        <div className="entity-view__actions">
          <button type="button" className="btn btn-primary" onClick={() => void onSave()} disabled={saving}>
            <Save size={16} aria-hidden />
            {saving ? t('shared.saving') : t('shared.save')}
          </button>
        </div>
      </header>
      <dl className="entity-view__dl">
        <dt>{t('linkTypes.source')}</dt>
        <dd>
          {sourceOt ? (
            <Link to={`/ontology-manager/object-types/${sourceOt.id}`}>{sourceOt.name}</Link>
          ) : (
            sourceId
          )}
        </dd>
        <dt>{t('linkTypes.target')}</dt>
        <dd>
          {targetOt ? (
            <Link to={`/ontology-manager/object-types/${targetOt.id}`}>{targetOt.name}</Link>
          ) : (
            targetId
          )}
        </dd>
        <dt>{t('linkTypes.instances')}</dt>
        <dd>{linkType.link_count}</dd>
      </dl>
      <div className="entity-view__form">
        <label className="console-form-field">
          <span>{t('linkTypes.name')}</span>
          <input className="console-form-control" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="console-form-field">
          <span>{t('linkTypes.description')}</span>
          <input
            className="console-form-control"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="console-form-field">
          <span>{t('linkTypes.source')}</span>
          <select
            className="console-form-control"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
          >
            {objectTypes.map((ot) => (
              <option key={ot.id} value={ot.id}>
                {ot.name}
              </option>
            ))}
          </select>
        </label>
        <label className="console-form-field">
          <span>{t('linkTypes.target')}</span>
          <select
            className="console-form-control"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          >
            {objectTypes.map((ot) => (
              <option key={ot.id} value={ot.id}>
                {ot.name}
              </option>
            ))}
          </select>
        </label>
        <label className="console-form-field">
          <span>{t('linkTypes.cardinality')}</span>
          <select
            className="console-form-control"
            value={cardinality}
            onChange={(e) => setCardinality(e.target.value)}
          >
            {CARDINALITY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {(cardinality === 'many-to-one' || cardinality === 'one-to-many') && (
          <>
            <label className="console-form-field">
              <span>{t('linkTypes.sourceKeyProperty')}</span>
              <select
                className="console-form-control"
                value={sourceKeyProperty}
                onChange={(e) => setSourceKeyProperty(e.target.value)}
              >
                <option value="">{t('objectTypes.none')}</option>
                {sourceProps.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="console-form-field">
              <span>{t('linkTypes.targetKeyProperty')}</span>
              <select
                className="console-form-control"
                value={targetKeyProperty}
                onChange={(e) => setTargetKeyProperty(e.target.value)}
              >
                <option value="">{t('objectTypes.none')}</option>
                {targetProps.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
    </>
  );
}

export function LinkTypeDatasourcesTab() {
  const { t } = useTranslation('ontology');
  const {
    datasets,
    datasetColumns,
    datasetId,
    setDatasetId,
    cardinality,
    sourceDatasetColumn,
    setSourceDatasetColumn,
    targetDatasetColumn,
    setTargetDatasetColumn,
    saving,
    onSave,
  } = useLinkTypeDetail();

  return (
    <>
      <header className="page-header">
        <div>
          <h1>{t('linkTypes.datasources')}</h1>
          <p className="page-subtitle">{t('linkTypes.datasourcesHint')}</p>
        </div>
        <div className="entity-view__actions">
          <button type="button" className="btn btn-primary" onClick={() => void onSave()} disabled={saving}>
            <Save size={16} aria-hidden />
            {saving ? t('shared.saving') : t('shared.save')}
          </button>
        </div>
      </header>
      <div className="entity-view__form">
        <label className="console-form-field">
          <span>{t('linkTypes.junctionDataset')}</span>
          <select
            className="console-form-control"
            value={datasetId}
            onChange={(e) => setDatasetId(e.target.value)}
            disabled={cardinality !== 'many-to-many'}
          >
            <option value="">{t('objectTypes.none')}</option>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.display_name || `${d.schema_name}.${d.table_name}`}
              </option>
            ))}
          </select>
          {cardinality !== 'many-to-many' ? (
            <span className="console-modal-hint console-modal-hint--block">
              {t('linkTypes.datasetOnlyM2M')}
            </span>
          ) : null}
        </label>
        {cardinality === 'many-to-many' && datasetId ? (
          <>
            <label className="console-form-field">
              <span>{t('linkTypes.sourceDatasetColumn')}</span>
              <select
                className="console-form-control"
                value={sourceDatasetColumn}
                onChange={(e) => setSourceDatasetColumn(e.target.value)}
              >
                <option value="">{t('objectTypes.none')}</option>
                {datasetColumns.map((c) => (
                  <option key={c.column_name} value={c.column_name}>
                    {c.column_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="console-form-field">
              <span>{t('linkTypes.targetDatasetColumn')}</span>
              <select
                className="console-form-control"
                value={targetDatasetColumn}
                onChange={(e) => setTargetDatasetColumn(e.target.value)}
              >
                <option value="">{t('objectTypes.none')}</option>
                {datasetColumns.map((c) => (
                  <option key={c.column_name} value={c.column_name}>
                    {c.column_name}
                  </option>
                ))}
              </select>
            </label>
            <p className="console-modal-hint">
              <Link to={`/ontology-manager/datasets/${datasetId}`}>{t('objectTypes.openDataset')}</Link>
            </p>
          </>
        ) : null}
      </div>
    </>
  );
}

export function LinkTypeSharingTab() {
  const { t } = useTranslation('ontology');
  const { linkTypeId = '' } = useParams();

  return (
    <>
      <header className="page-header">
        <div>
          <h1>{t('linkTypes.sharing')}</h1>
          <p className="page-subtitle">{t('linkTypes.sharingHint')}</p>
        </div>
      </header>
      {linkTypeId ? (
        <ResourceSharePanel
          resourceType={RESOURCE_TYPES.linkType}
          resourceId={linkTypeId}
          title={t('linkTypes.sharing')}
        />
      ) : null}
    </>
  );
}

export function LinkTypeSettingsRedirect() {
  const { linkTypeId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  const target =
    tab === 'sharing'
      ? `/ontology-manager/link-types/${linkTypeId}/sharing`
      : `/ontology-manager/link-types/${linkTypeId}`;
  return <Navigate to={target} replace />;
}
