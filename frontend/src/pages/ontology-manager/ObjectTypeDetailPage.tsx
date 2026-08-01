import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { Link, Navigate, Outlet, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Database, ExternalLink, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchLinkTypes,
  fetchObjectType,
  indexObjectTypeToNeo4j,
  updateObjectType,
  type LinkTypeResponse,
  type ObjectTypeResponse,
} from '../../data/ontologyApi';
import {
  fetchDatasets,
  fetchDatasetMetadata,
  type DatasetResponse,
  type ColumnMetadata,
} from '../../data/datasetsApi';
import { fetchAllDataSources, type DataSourceResponse } from '../../data/dataSourcesApi';
import { fetchOntologyActionTypes, type OntologyActionTypeResponse } from '../../data/ontologyFunctionsApi';
import { ResourceSharePanel } from '../../components/ResourceSharePanel';
import { RESOURCE_TYPES } from '../../data/resourceAclApi';
import {
  mapPgTypeToPropType,
  PropertiesEditor,
  toPropertyDefs,
  type FormProperty,
} from './objectTypeFormParts';
import {
  EntityViewCheck,
  EntityViewField,
  EntityViewHeader,
  EntityViewLoading,
  EntityViewPanel,
  EntityViewShell,
  EntityViewStat,
  EntityViewStats,
} from './EntityViewShell';
import '../ontology/ontology-admin.scss';

type ObjectTypeDetailContext = {
  objectType: ObjectTypeResponse;
  relatedLinks: LinkTypeResponse[];
  relatedActions: OntologyActionTypeResponse[];
  datasets: DatasetResponse[];
  neo4jDataSources: DataSourceResponse[];
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  isMasterData: boolean;
  setIsMasterData: (v: boolean) => void;
  displayProperty: string;
  setDisplayProperty: (v: string) => void;
  datasetId: string;
  setDatasetId: (v: string) => void;
  properties: FormProperty[];
  setProperties: Dispatch<SetStateAction<FormProperty[]>>;
  keyProperty: string;
  setKeyProperty: (v: string) => void;
  loadingMetadata: boolean;
  saving: boolean;
  indexing: boolean;
  onSave: () => Promise<void>;
  onIndex: (neo4jId: string) => Promise<void>;
  reload: () => Promise<void>;
};

const ObjectTypeDetailCtx = createContext<ObjectTypeDetailContext | null>(null);

function useObjectTypeDetail(): ObjectTypeDetailContext {
  const ctx = useContext(ObjectTypeDetailCtx);
  if (!ctx) throw new Error('useObjectTypeDetail requires ObjectTypeDetailPage');
  return ctx;
}

export function ObjectTypeDetailPage() {
  const { t } = useTranslation('ontology');
  const { typeId = '' } = useParams();
  const [objectType, setObjectType] = useState<ObjectTypeResponse | null>(null);
  const [relatedLinks, setRelatedLinks] = useState<LinkTypeResponse[]>([]);
  const [relatedActions, setRelatedActions] = useState<OntologyActionTypeResponse[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [dataSources, setDataSources] = useState<DataSourceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isMasterData, setIsMasterData] = useState(false);
  const [displayProperty, setDisplayProperty] = useState('');
  const [datasetId, setDatasetId] = useState('');
  const [properties, setProperties] = useState<FormProperty[]>([]);
  const [keyProperty, setKeyProperty] = useState('');
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const savedPropNamesRef = useRef<Set<string> | null>(null);
  const skipNextDatasetLoad = useRef(true);

  const neo4jDataSources = useMemo(
    () => dataSources.filter((ds) => ds.kind === 'neo4j'),
    [dataSources],
  );

  const applyObjectType = useCallback((ot: ObjectTypeResponse) => {
    setObjectType(ot);
    setName(ot.name);
    setDescription(ot.description || '');
    setIsMasterData(ot.is_master_data ?? false);
    setDisplayProperty(ot.display_property || '');
    setKeyProperty(ot.key_property || '');
    const dsId = ot.dataset_id || '';
    skipNextDatasetLoad.current = true;
    if (dsId) {
      savedPropNamesRef.current = new Set((ot.properties || []).map((p) => p.name));
    } else {
      savedPropNamesRef.current = null;
      setProperties(
        (ot.properties || []).map((p) => ({
          name: p.name,
          type: p.type || 'string',
          required: !!p.required,
          enabled: true,
        })),
      );
    }
    setDatasetId(dsId);
  }, []);

  const load = useCallback(async () => {
    if (!typeId) return;
    setLoading(true);
    try {
      const [ot, linksRes, actions, dsRes, dsSourcesRes] = await Promise.all([
        fetchObjectType(typeId),
        fetchLinkTypes(),
        fetchOntologyActionTypes({ object_type_id: typeId }),
        fetchDatasets(),
        fetchAllDataSources(),
      ]);
      applyObjectType(ot);
      setRelatedLinks(
        linksRes.items.filter(
          (lt) => lt.source_object_type_id === typeId || lt.target_object_type_id === typeId,
        ),
      );
      setRelatedActions(actions);
      setDatasets(dsRes.items);
      setDataSources(dsSourcesRes);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('objectTypes.loadFailed'));
      setObjectType(null);
    } finally {
      setLoading(false);
    }
  }, [typeId, applyObjectType, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!datasetId) {
      if (!skipNextDatasetLoad.current && objectType && !objectType.dataset_id) {
        // manual mode already has properties
      }
      return;
    }
    if (skipNextDatasetLoad.current) {
      skipNextDatasetLoad.current = false;
    }
    const enabledNames = savedPropNamesRef.current;
    savedPropNamesRef.current = null;
    let cancelled = false;
    setLoadingMetadata(true);
    fetchDatasetMetadata(datasetId)
      .then((cols: ColumnMetadata[]) => {
        if (cancelled) return;
        const props: FormProperty[] = cols.map((c) => ({
          name: c.column_name,
          type: mapPgTypeToPropType(c.data_type),
          required: !c.is_nullable,
          enabled: enabledNames ? enabledNames.has(c.column_name) : true,
        }));
        setProperties(props);
        setKeyProperty((prev) => (prev ? prev : cols[0]?.column_name || ''));
      })
      .catch((e) => {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : t('objectTypes.loadColumnsFailed'));
          setProperties([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMetadata(false);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId, objectType, t]);

  const onSave = useCallback(async () => {
    if (!typeId || !name.trim()) return;
    setSaving(true);
    try {
      const updated = await updateObjectType(typeId, {
        name: name.trim(),
        description: description.trim() || undefined,
        dataset_id: datasetId || undefined,
        properties: toPropertyDefs(properties),
        key_property: keyProperty || undefined,
        is_master_data: isMasterData,
        display_property: displayProperty || undefined,
      });
      applyObjectType(updated);
      toast.success(t('objectTypes.saved'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('objectTypes.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [
    typeId,
    name,
    description,
    datasetId,
    properties,
    keyProperty,
    isMasterData,
    displayProperty,
    applyObjectType,
    t,
  ]);

  const onIndex = useCallback(
    async (neo4jId: string) => {
      if (!typeId || !neo4jId) return;
      setIndexing(true);
      try {
        const res = await indexObjectTypeToNeo4j(typeId, neo4jId);
        toast.success(
          t('objectTypes.indexSuccess', {
            types: res.object_types_indexed,
            nodes: res.nodes_created,
          }),
        );
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t('objectTypes.indexFailed'));
      } finally {
        setIndexing(false);
      }
    },
    [typeId, t],
  );

  const value = useMemo(
    () =>
      objectType
        ? {
            objectType,
            relatedLinks,
            relatedActions,
            datasets,
            neo4jDataSources,
            name,
            setName,
            description,
            setDescription,
            isMasterData,
            setIsMasterData,
            displayProperty,
            setDisplayProperty,
            datasetId,
            setDatasetId,
            properties,
            setProperties,
            keyProperty,
            setKeyProperty,
            loadingMetadata,
            saving,
            indexing,
            onSave,
            onIndex,
            reload: load,
          }
        : null,
    [
      objectType,
      relatedLinks,
      relatedActions,
      datasets,
      neo4jDataSources,
      name,
      description,
      isMasterData,
      displayProperty,
      datasetId,
      properties,
      keyProperty,
      loadingMetadata,
      saving,
      indexing,
      onSave,
      onIndex,
      load,
    ],
  );

  if (loading) {
    return <EntityViewLoading label={t('shared.loading')} />;
  }

  if (!objectType || !value) {
    return (
      <p className="ontology-admin-loading">
        {t('objectTypes.notFound')}{' '}
        <Link to="/ontology-manager/object-types">{t('objectTypes.backToList')}</Link>
      </p>
    );
  }

  const base = `/ontology-manager/object-types/${typeId}`;

  return (
    <ObjectTypeDetailCtx.Provider value={value}>
      <EntityViewShell
        backTo="/ontology-manager/object-types"
        backLabel={t('objectTypes.backToList')}
        kind={t('objectTypes.kind')}
        title={objectType.name}
        meta={t('objectTypes.instanceCount', { count: objectType.instance_count })}
        navItems={[
          { to: base, label: t('objectTypes.overview'), end: true },
          { to: `${base}/properties`, label: t('objectTypes.properties') },
          { to: `${base}/datasources`, label: t('objectTypes.datasources') },
          { to: `${base}/sharing`, label: t('objectTypes.sharing') },
        ]}
      >
        <Outlet />
      </EntityViewShell>
    </ObjectTypeDetailCtx.Provider>
  );
}

export function ObjectTypeOverviewTab() {
  const { t } = useTranslation('ontology');
  const {
    objectType,
    relatedLinks,
    relatedActions,
    name,
    setName,
    description,
    setDescription,
    isMasterData,
    setIsMasterData,
    displayProperty,
    setDisplayProperty,
    properties,
    neo4jDataSources,
    saving,
    indexing,
    onSave,
    onIndex,
  } = useObjectTypeDetail();
  const [neo4jId, setNeo4jId] = useState(neo4jDataSources[0]?.id || '');

  useEffect(() => {
    if (!neo4jId && neo4jDataSources[0]) setNeo4jId(neo4jDataSources[0].id);
  }, [neo4jId, neo4jDataSources]);

  const relatedLinksValue =
    relatedLinks.length === 0
      ? '—'
      : relatedLinks.map((lt, i) => (
          <span key={lt.id}>
            {i > 0 ? ', ' : ''}
            <Link to={`/ontology-manager/link-types/${lt.id}`}>{lt.name}</Link>
          </span>
        ));
  const relatedActionsValue =
    relatedActions.length === 0
      ? '—'
      : relatedActions.map((a, i) => (
          <span key={a.id}>
            {i > 0 ? ', ' : ''}
            <Link to={`/ontology-manager/actions/${a.id}`}>{a.display_name}</Link>
          </span>
        ));

  return (
    <>
      <EntityViewHeader
        title={t('objectTypes.overview')}
        subtitle={objectType.description || t('objectTypes.noDescription')}
        actions={
          <>
            <Link to={`/object-explorer/objects/${objectType.id}`} className="btn btn-secondary">
              <ExternalLink size={16} aria-hidden />
              {t('objectTypes.openInExplorer')}
            </Link>
            <button type="button" className="btn btn-primary" onClick={() => void onSave()} disabled={saving}>
              <Save size={16} aria-hidden />
              {saving ? t('shared.saving') : t('shared.save')}
            </button>
          </>
        }
      />
      <EntityViewStats>
        <EntityViewStat label={t('objectTypes.dataset')} value={objectType.dataset_name || '—'} />
        <EntityViewStat label={t('objectTypes.properties')} value={(objectType.properties || []).length} />
        <EntityViewStat label={t('objectTypes.instances')} value={objectType.instance_count} />
        <EntityViewStat label={t('objectTypes.relatedLinkTypes')} value={relatedLinksValue} />
        <EntityViewStat label={t('objectTypes.relatedActions')} value={relatedActionsValue} />
      </EntityViewStats>
      <EntityViewPanel title={t('objectTypes.general')} description={t('objectTypes.generalHint')}>
        <div className="entity-view__form">
          <EntityViewField label={t('objectTypes.name')}>
            <input className="console-form-control" value={name} onChange={(e) => setName(e.target.value)} />
          </EntityViewField>
          <EntityViewField label={t('objectTypes.description')}>
            <textarea
              className="console-form-control"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </EntityViewField>
          <EntityViewCheck
            checked={isMasterData}
            onChange={setIsMasterData}
            title={t('objectTypes.masterData')}
            hint={t('objectTypes.masterDataHint')}
          />
          <EntityViewField label={t('objectTypes.displayProperty')}>
            <select
              className="console-form-control"
              value={displayProperty}
              onChange={(e) => setDisplayProperty(e.target.value)}
            >
              <option value="">{t('objectTypes.none')}</option>
              {properties
                .filter((p) => p.name.trim() && p.enabled !== false)
                .map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
            </select>
          </EntityViewField>
        </div>
      </EntityViewPanel>
      {(objectType.dataset_id || objectType.instance_count > 0) && neo4jDataSources.length > 0 ? (
        <EntityViewPanel
          title={t('objectTypes.indexHeading')}
          description={t('objectTypes.indexHint')}
          footer={
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!neo4jId || indexing}
              onClick={() => void onIndex(neo4jId)}
            >
              <Database size={16} aria-hidden />
              {indexing ? t('objectTypes.indexing') : t('objectTypes.index')}
            </button>
          }
        >
          <div className="entity-view__form">
            <EntityViewField label={t('objectTypes.neo4jSource')}>
              <select
                className="console-form-control"
                value={neo4jId}
                onChange={(e) => setNeo4jId(e.target.value)}
                disabled={indexing}
              >
                {neo4jDataSources.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name} ({ds.host}:{ds.port ?? 7687})
                  </option>
                ))}
              </select>
            </EntityViewField>
          </div>
        </EntityViewPanel>
      ) : null}
    </>
  );
}

export function ObjectTypePropertiesTab() {
  const { t } = useTranslation('ontology');
  const {
    datasetId,
    properties,
    setProperties,
    keyProperty,
    setKeyProperty,
    loadingMetadata,
    saving,
    onSave,
  } = useObjectTypeDetail();

  return (
    <>
      <EntityViewHeader
        title={t('objectTypes.properties')}
        subtitle={t('objectTypes.propertiesTabHint')}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => void onSave()} disabled={saving}>
            <Save size={16} aria-hidden />
            {saving ? t('shared.saving') : t('shared.save')}
          </button>
        }
      />
      <EntityViewPanel>
        <PropertiesEditor
          properties={properties}
          fromDataset={!!datasetId}
          nameTypeReadOnly={!!datasetId}
          keyProperty={keyProperty}
          loadingMetadata={loadingMetadata}
          onAdd={
            datasetId
              ? undefined
              : () =>
                  setProperties((prev) => [
                    ...prev,
                    { name: '', type: 'string', required: false, enabled: true },
                  ])
          }
          onChange={(idx, p) =>
            setProperties((prev) => {
              const next = [...prev];
              next[idx] = p;
              return next;
            })
          }
          onRemove={(idx) => setProperties((prev) => prev.filter((_, i) => i !== idx))}
          onToggleEnabled={
            datasetId
              ? (idx, enabled) =>
                  setProperties((prev) => {
                    const next = [...prev];
                    next[idx] = { ...next[idx], enabled };
                    return next;
                  })
              : undefined
          }
          onKeyPropertyChange={setKeyProperty}
        />
      </EntityViewPanel>
    </>
  );
}

export function ObjectTypeDatasourcesTab() {
  const { t } = useTranslation('ontology');
  const { datasets, datasetId, setDatasetId, objectType, saving, onSave } = useObjectTypeDetail();

  return (
    <>
      <EntityViewHeader
        title={t('objectTypes.datasources')}
        subtitle={t('objectTypes.datasourcesHint')}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => void onSave()} disabled={saving}>
            <Save size={16} aria-hidden />
            {saving ? t('shared.saving') : t('shared.save')}
          </button>
        }
      />
      <EntityViewPanel>
        <div className="entity-view__form">
          <EntityViewField label={t('objectTypes.dataset')}>
            <select
              className="console-form-control"
              value={datasetId}
              onChange={(e) => setDatasetId(e.target.value)}
            >
              <option value="">{t('objectTypes.none')}</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.display_name || `${d.schema_name}.${d.table_name}`}
                </option>
              ))}
            </select>
          </EntityViewField>
          {datasetId ? (
            <p className="entity-view__field-hint">
              <Link to={`/ontology-manager/datasets/${datasetId}`}>{t('objectTypes.openDataset')}</Link>
              {objectType.dataset_name ? ` — ${objectType.dataset_name}` : null}
            </p>
          ) : null}
        </div>
      </EntityViewPanel>
    </>
  );
}

export function ObjectTypeSharingTab() {
  const { t } = useTranslation('ontology');
  const { typeId = '' } = useParams();

  return (
    <>
      <EntityViewHeader title={t('objectTypes.sharing')} subtitle={t('objectTypes.sharingHint')} />
      <EntityViewPanel>
        {typeId ? (
          <ResourceSharePanel
            resourceType={RESOURCE_TYPES.objectType}
            resourceId={typeId}
            title={t('objectTypes.sharing')}
          />
        ) : null}
      </EntityViewPanel>
    </>
  );
}

/** Legacy settings URL → sharing (or overview). */
export function ObjectTypeSettingsRedirect() {
  const { typeId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  const target =
    tab === 'sharing'
      ? `/ontology-manager/object-types/${typeId}/sharing`
      : `/ontology-manager/object-types/${typeId}`;
  return <Navigate to={target} replace />;
}
