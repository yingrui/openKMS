import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, Navigate, Outlet, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
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
import {
  fetchOntologyActionTypes,
  fetchOntologyFunctions,
  type OntologyActionTypeResponse,
  type OntologyFunctionResponse,
} from '../../data/ontologyFunctionsApi';
import { ResourceSharePanel } from '../../components/ResourceSharePanel';
import { RESOURCE_TYPES } from '../../data/resourceAclApi';
import { PropertiesEditor } from './objectTypeFormParts';
import {
  ontologyTypeFromColumn,
  toHandCreatedPropertyDefs,
  toPropertyDefs,
  withoutReservedProperties,
  type FormProperty,
} from './objectTypeFormModel';
import {
  EntityViewField,
  EntityViewHeader,
  EntityViewLoading,
  EntityViewPanel,
  EntityViewShell,
} from './EntityViewShell';
import { ObjectTypeDetailCtx, useObjectTypeDetail } from './useObjectTypeDetail';
import '../ontology/ontology-admin.scss';

export function ObjectTypeDetailPage() {
  const { t } = useTranslation('ontology');
  const { typeId = '' } = useParams();
  const [objectType, setObjectType] = useState<ObjectTypeResponse | null>(null);
  const [relatedLinks, setRelatedLinks] = useState<LinkTypeResponse[]>([]);
  const [relatedActions, setRelatedActions] = useState<OntologyActionTypeResponse[]>([]);
  const [relatedFunctions, setRelatedFunctions] = useState<OntologyFunctionResponse[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [dataSources, setDataSources] = useState<DataSourceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [name, setName] = useState('');
  const [apiName, setApiName] = useState('');
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
    setApiName(ot.api_name || '');
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
        withoutReservedProperties(
          (ot.properties || []).map((p) => ({
            name: p.name,
            type: p.type || 'string',
            required: !!p.required,
            enabled: true,
          })),
        ),
      );
    }
    setDatasetId(dsId);
  }, []);

  const load = useCallback(async () => {
    if (!typeId) return;
    setLoading(true);
    try {
      const [ot, linksRes, actions, fnRes, dsRes, dsSourcesRes] = await Promise.all([
        fetchObjectType(typeId),
        fetchLinkTypes(),
        fetchOntologyActionTypes({ object_type_id: typeId }),
        fetchOntologyFunctions(),
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
      const viaActionFnIds = new Set(
        actions.map((a) => a.function_id).filter((id): id is string => Boolean(id)),
      );
      const otName = ot.name;
      const relatedLtNames = new Set(
        linksRes.items
          .filter((lt) => lt.source_object_type_id === typeId || lt.target_object_type_id === typeId)
          .map((lt) => lt.name),
      );
      setRelatedFunctions(
        fnRes.items.filter((fn) => {
          if (fn.object_type_id === typeId || viaActionFnIds.has(fn.id)) return true;
          const rel = fn.schema_relations;
          if (!rel) return false;
          if (rel.object_type_names.includes(otName)) return true;
          return rel.link_type_names.some((name) => relatedLtNames.has(name));
        }),
      );
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
          type: ontologyTypeFromColumn(c),
          required: !c.is_nullable,
          enabled: enabledNames ? enabledNames.has(c.column_name) : true,
        }));
        setProperties(props);
        setKeyProperty((prev) =>
          prev && cols.some((c) => c.column_name === prev) ? prev : '',
        );
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
        // Only a row that predates api_name can claim one; sending it again would be a rename,
        // which the API refuses (published Functions call this type by it).
        ...(objectType?.api_name ? {} : apiName.trim() ? { api_name: apiName.trim() } : {}),
        description: description.trim() || undefined,
        dataset_id: datasetId || undefined,
        properties: datasetId ? toPropertyDefs(properties) : toHandCreatedPropertyDefs(properties),
        // Business primary key (optional). Empty string clears on update.
        key_property: keyProperty,
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
    apiName,
    objectType?.api_name,
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
            relatedFunctions,
            datasets,
            neo4jDataSources,
            name,
            setName,
            apiName,
            setApiName,
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
      relatedFunctions,
      datasets,
      neo4jDataSources,
      name,
      apiName,
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
              <Link to={`/datasets/${datasetId}`}>{t('objectTypes.openDataset')}</Link>
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
