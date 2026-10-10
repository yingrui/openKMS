import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Plus, Save, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchLinkTypes,
  fetchObjectTypes,
  type LinkTypeResponse,
  type ObjectTypeResponse,
} from '../../data/ontologyApi';
import {
  executeOntologyFunction,
  fetchFunctionExecutions,
  fetchFunctionVersions,
  fetchOntologyActionTypes,
  fetchOntologyFunction,
  publishOntologyFunction,
  saveFunctionVersion,
  updateOntologyFunction,
  type OntologyActionTypeResponse,
  type OntologyFunctionExecutionResponse,
  type OntologyFunctionResponse,
  type OntologySchemaFieldKind,
} from '../../data/ontologyFunctionsApi';
import {
  buildIoSchema,
  emptyField,
  fieldsFromRelations,
  requiredKeysFromSchema,
  type EditableSchemaField,
} from '../../data/ontologyIoSchema';
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

type FunctionDetailContext = {
  fn: OntologyFunctionResponse;
  executions: OntologyFunctionExecutionResponse[];
  objectTypes: ObjectTypeResponse[];
  linkTypes: LinkTypeResponse[];
  boundActions: OntologyActionTypeResponse[];
  objectTypeId: string;
  setObjectTypeId: (v: string) => void;
  inputFields: EditableSchemaField[];
  setInputFields: (v: EditableSchemaField[] | ((prev: EditableSchemaField[]) => EditableSchemaField[])) => void;
  outputFields: EditableSchemaField[];
  setOutputFields: (v: EditableSchemaField[] | ((prev: EditableSchemaField[]) => EditableSchemaField[])) => void;
  publishing: boolean;
  saving: boolean;
  savingSchema: boolean;
  onPublish: () => Promise<void>;
  onTestPublished: () => Promise<void>;
  onSave: () => Promise<void>;
  onSaveSchema: () => Promise<void>;
  reload: () => Promise<void>;
};

const FunctionDetailCtx = createContext<FunctionDetailContext | null>(null);

function useFunctionDetail(): FunctionDetailContext {
  const ctx = useContext(FunctionDetailCtx);
  if (!ctx) throw new Error('useFunctionDetail requires FunctionDetailPage');
  return ctx;
}

export function FunctionDetailPage() {
  const { t } = useTranslation('ontology');
  const { functionId = '' } = useParams();
  const [fn, setFn] = useState<OntologyFunctionResponse | null>(null);
  const [executions, setExecutions] = useState<OntologyFunctionExecutionResponse[]>([]);
  const [objectTypes, setObjectTypes] = useState<ObjectTypeResponse[]>([]);
  const [linkTypes, setLinkTypes] = useState<LinkTypeResponse[]>([]);
  const [boundActions, setBoundActions] = useState<OntologyActionTypeResponse[]>([]);
  const [objectTypeId, setObjectTypeId] = useState('');
  const [inputFields, setInputFields] = useState<EditableSchemaField[]>([]);
  const [outputFields, setOutputFields] = useState<EditableSchemaField[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingSchema, setSavingSchema] = useState(false);

  const applySchemaFromFn = useCallback((f: OntologyFunctionResponse) => {
    const rel = f.schema_relations;
    setInputFields(
      fieldsFromRelations(rel?.fields, 'input', requiredKeysFromSchema(rel?.input_schema ?? undefined)),
    );
    setOutputFields(
      fieldsFromRelations(rel?.fields, 'output', requiredKeysFromSchema(rel?.output_schema ?? undefined)),
    );
  }, []);

  const load = useCallback(async () => {
    if (!functionId) return;
    setLoading(true);
    try {
      const [f, ex, typesRes, linksRes, actions] = await Promise.all([
        fetchOntologyFunction(functionId),
        fetchFunctionExecutions(functionId),
        fetchObjectTypes(),
        fetchLinkTypes(),
        fetchOntologyActionTypes(),
      ]);
      setFn(f);
      setExecutions(ex);
      setObjectTypes(typesRes.items);
      setLinkTypes(linksRes.items);
      setObjectTypeId(f.object_type_id ?? '');
      setBoundActions(actions.filter((a) => a.function_id === functionId));
      applySchemaFromFn(f);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('functions.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [functionId, t, applySchemaFromFn]);

  useEffect(() => {
    void load();
  }, [load]);

  const onPublish = useCallback(async () => {
    if (!functionId) return;
    setPublishing(true);
    try {
      const updated = await publishOntologyFunction(functionId);
      setFn(updated);
      applySchemaFromFn(updated);
      toast.success(t('functions.published'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('functions.publishFailed'));
    } finally {
      setPublishing(false);
    }
  }, [functionId, t, applySchemaFromFn]);

  const onTestPublished = useCallback(async () => {
    if (!functionId) return;
    try {
      const res = await executeOntologyFunction(functionId, {}, { use_published: true });
      if (res.status === 'ok') toast.success(JSON.stringify(res.output));
      else toast.error(res.error || t('functions.runFailed'));
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('functions.runFailed'));
    }
  }, [functionId, load, t]);

  const onSave = useCallback(async () => {
    if (!functionId) return;
    setSaving(true);
    try {
      const updated = await updateOntologyFunction(functionId, {
        object_type_id: objectTypeId || null,
      });
      setFn(updated);
      setObjectTypeId(updated.object_type_id ?? '');
      toast.success(t('functions.saved'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('functions.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [functionId, objectTypeId, t]);

  const onSaveSchema = useCallback(async () => {
    if (!functionId) return;
    for (const f of [...inputFields, ...outputFields]) {
      if (!f.key.trim()) {
        toast.error(t('functions.schemaFieldNameRequired'));
        return;
      }
      if (f.kind !== 'primitive' && !f.typeName.trim()) {
        toast.error(t('functions.schemaTypeNameRequired'));
        return;
      }
    }
    setSavingSchema(true);
    try {
      const versions = await fetchFunctionVersions(functionId);
      const latest = versions[0];
      if (!latest) {
        toast.error(t('functions.noVersionForSchema'));
        return;
      }
      await saveFunctionVersion(functionId, {
        source_code: latest.source_code,
        input_schema: buildIoSchema(inputFields),
        output_schema: buildIoSchema(outputFields),
      });
      const updated = await fetchOntologyFunction(functionId);
      setFn(updated);
      applySchemaFromFn(updated);
      toast.success(t('functions.schemaSaved'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('functions.schemaSaveFailed'));
    } finally {
      setSavingSchema(false);
    }
  }, [functionId, inputFields, outputFields, t, applySchemaFromFn]);

  const value = useMemo(
    () =>
      fn
        ? {
            fn,
            executions,
            objectTypes,
            linkTypes,
            boundActions,
            objectTypeId,
            setObjectTypeId,
            inputFields,
            setInputFields,
            outputFields,
            setOutputFields,
            publishing,
            saving,
            savingSchema,
            onPublish,
            onTestPublished,
            onSave,
            onSaveSchema,
            reload: load,
          }
        : null,
    [
      fn,
      executions,
      objectTypes,
      linkTypes,
      boundActions,
      objectTypeId,
      inputFields,
      outputFields,
      publishing,
      saving,
      savingSchema,
      onPublish,
      onTestPublished,
      onSave,
      onSaveSchema,
      load,
    ],
  );

  if (loading || !fn || !value) {
    return <EntityViewLoading label={t('shared.loading')} />;
  }

  const base = `/ontology-manager/functions/${functionId}`;

  return (
    <FunctionDetailCtx.Provider value={value}>
      <EntityViewShell
        backTo="/ontology-manager/functions"
        backLabel={t('functions.backToList')}
        kind={t('functions.kind')}
        title={fn.display_name}
        meta={fn.api_name}
        navItems={[
          { to: base, label: t('functions.overview'), end: true },
          { to: `${base}/observability`, label: t('functions.observability') },
        ]}
      >
        <Outlet />
      </EntityViewShell>
    </FunctionDetailCtx.Provider>
  );
}

function SchemaFieldsEditor({
  title,
  fields,
  setFields,
  objectTypes,
  linkTypes,
}: {
  title: string;
  fields: EditableSchemaField[];
  setFields: (v: EditableSchemaField[] | ((prev: EditableSchemaField[]) => EditableSchemaField[])) => void;
  objectTypes: ObjectTypeResponse[];
  linkTypes: LinkTypeResponse[];
}) {
  const { t } = useTranslation('ontology');

  const updateRow = (index: number, patch: Partial<EditableSchemaField>) => {
    setFields((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <EntityViewPanel title={title}>
      <div className="entity-view__embedded-table">
        <div className="ds-table-wrap ds-table-wrap--flush">
          <table className="console-table">
            <thead>
              <tr>
                <th>{t('functions.schemaField')}</th>
                <th>{t('functions.schemaKind')}</th>
                <th>{t('functions.schemaTypeName')}</th>
                <th>{t('functions.schemaArray')}</th>
                <th>{t('functions.schemaRequired')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fields.length === 0 ? (
                <tr>
                  <td colSpan={6} className="console-table-empty">
                    {t('functions.schemaEmpty')}
                  </td>
                </tr>
              ) : (
                fields.map((row, index) => (
                  <tr key={`${row.key}-${index}`}>
                    <td>
                      <input
                        className="console-form-control"
                        value={row.key}
                        onChange={(e) => updateRow(index, { key: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        className="console-form-control"
                        value={row.kind}
                        onChange={(e) => {
                          const kind = e.target.value as OntologySchemaFieldKind;
                          updateRow(index, {
                            kind,
                            typeName: kind === 'primitive' ? '' : row.typeName,
                            isArray: kind === 'primitive' ? row.isArray : row.isArray,
                            jsonType: kind === 'primitive' ? row.jsonType || 'string' : 'string',
                          });
                        }}
                      >
                        <option value="primitive">{t('functions.schemaKindPrimitive')}</option>
                        <option value="object_type">{t('functions.schemaKindObjectType')}</option>
                        <option value="link_type">{t('functions.schemaKindLinkType')}</option>
                      </select>
                    </td>
                    <td>
                      {row.kind === 'primitive' ? (
                        <select
                          className="console-form-control"
                          value={row.jsonType}
                          onChange={(e) => updateRow(index, { jsonType: e.target.value })}
                        >
                          <option value="string">string</option>
                          <option value="integer">integer</option>
                          <option value="number">number</option>
                          <option value="boolean">boolean</option>
                          <option value="object">object</option>
                        </select>
                      ) : row.kind === 'object_type' ? (
                        <select
                          className="console-form-control"
                          value={row.typeName}
                          onChange={(e) => updateRow(index, { typeName: e.target.value })}
                        >
                          <option value="">{t('functions.schemaPickType')}</option>
                          {objectTypes.map((ot) => (
                            <option key={ot.id} value={ot.name}>
                              {ot.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select
                          className="console-form-control"
                          value={row.typeName}
                          onChange={(e) => updateRow(index, { typeName: e.target.value })}
                        >
                          <option value="">{t('functions.schemaPickType')}</option>
                          {linkTypes.map((lt) => (
                            <option key={lt.id} value={lt.name}>
                              {lt.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        className="ds-checkbox"
                        checked={row.isArray}
                        onChange={(e) => updateRow(index, { isArray: e.target.checked })}
                        disabled={row.kind === 'primitive' && row.jsonType === 'object'}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        className="ds-checkbox"
                        checked={row.required}
                        onChange={(e) => updateRow(index, { required: e.target.checked })}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="console-table-icon-btn"
                        onClick={() => setFields((prev) => prev.filter((_, i) => i !== index))}
                        aria-label={t('shared.delete')}
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFields((prev) => [...prev, emptyField()])}>
        <Plus size={14} aria-hidden />
        {t('functions.schemaAddField')}
      </button>
    </EntityViewPanel>
  );
}

export function FunctionOverviewTab() {
  const { t } = useTranslation('ontology');
  const {
    fn,
    objectTypes,
    linkTypes,
    boundActions,
    objectTypeId,
    setObjectTypeId,
    inputFields,
    setInputFields,
    outputFields,
    setOutputFields,
    publishing,
    saving,
    savingSchema,
    onPublish,
    onTestPublished,
    onSave,
    onSaveSchema,
  } = useFunctionDetail();

  const objectTypeName =
    objectTypes.find((ot) => ot.id === (fn.object_type_id ?? ''))?.name ??
    (fn.object_type_id ? fn.object_type_id : '—');

  const relatedOtNames = fn.schema_relations?.object_type_names ?? [];
  const relatedLtNames = fn.schema_relations?.link_type_names ?? [];

  return (
    <>
      <EntityViewHeader
        title={t('functions.overview')}
        subtitle={fn.description || t('functions.noDescription')}
        actions={
          <>
            <Link to={`/function-editor/${fn.id}`} className="btn btn-secondary">
              <ExternalLink size={16} aria-hidden />
              {t('functions.openInEditor')}
            </Link>
            <button type="button" className="btn btn-secondary" onClick={() => void onSave()} disabled={saving}>
              <Save size={16} aria-hidden />
              {saving ? t('shared.saving') : t('shared.save')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void onPublish()} disabled={publishing}>
              <Upload size={16} aria-hidden />
              {publishing ? t('shared.saving') : t('functions.publish')}
            </button>
          </>
        }
      />
      <EntityViewStats>
        <EntityViewStat label={t('functions.publishedVersion')} value={fn.published_version ?? '—'} />
        <EntityViewStat label={t('functions.latestVersion')} value={fn.latest_version ?? '—'} />
        <EntityViewStat label={t('functions.developmentStatus')} value={fn.development_status} />
        <EntityViewStat label={t('functions.objectType')} value={objectTypeName} />
      </EntityViewStats>
      <EntityViewPanel title={t('functions.general')} description={t('functions.objectTypeHint')}>
        <div className="entity-view__form">
          <EntityViewField label={t('functions.objectType')}>
            <select
              className="console-form-control"
              value={objectTypeId}
              onChange={(e) => setObjectTypeId(e.target.value)}
            >
              <option value="">{t('functions.objectTypeNone')}</option>
              {objectTypes.map((ot) => (
                <option key={ot.id} value={ot.id}>
                  {ot.name}
                </option>
              ))}
            </select>
          </EntityViewField>
        </div>
      </EntityViewPanel>

      <EntityViewPanel title={t('functions.ioContract')} description={t('functions.ioContractHint')}>
        <EntityViewStats>
          <EntityViewStat
            label={t('functions.schemaRelatedObjectTypes')}
            value={
              relatedOtNames.length === 0
                ? '—'
                : relatedOtNames.map((name, i) => {
                    const ot = objectTypes.find((o) => o.name === name);
                    return (
                      <span key={name}>
                        {i > 0 ? ', ' : ''}
                        {ot ? (
                          <Link to={`/ontology-manager/object-types/${ot.id}`}>{name}</Link>
                        ) : (
                          name
                        )}
                      </span>
                    );
                  })
            }
          />
          <EntityViewStat
            label={t('functions.schemaRelatedLinkTypes')}
            value={
              relatedLtNames.length === 0
                ? '—'
                : relatedLtNames.map((name, i) => {
                    const lt = linkTypes.find((l) => l.name === name);
                    return (
                      <span key={name}>
                        {i > 0 ? ', ' : ''}
                        {lt ? (
                          <Link to={`/ontology-manager/link-types/${lt.id}`}>{name}</Link>
                        ) : (
                          name
                        )}
                      </span>
                    );
                  })
            }
          />
        </EntityViewStats>
        <div className="entity-view__form" style={{ marginTop: 'var(--space-3)' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void onSaveSchema()}
            disabled={savingSchema}
          >
            <Save size={16} aria-hidden />
            {savingSchema ? t('shared.saving') : t('functions.schemaSave')}
          </button>
        </div>
      </EntityViewPanel>

      <SchemaFieldsEditor
        title={t('functions.inputSchema')}
        fields={inputFields}
        setFields={setInputFields}
        objectTypes={objectTypes}
        linkTypes={linkTypes}
      />
      <SchemaFieldsEditor
        title={t('functions.outputSchema')}
        fields={outputFields}
        setFields={setOutputFields}
        objectTypes={objectTypes}
        linkTypes={linkTypes}
      />

      <EntityViewPanel title={t('functions.usage')} description={t('functions.usageHint')}>
        {boundActions.length === 0 ? (
          <p className="entity-view__field-hint">{t('functions.usageEmpty')}</p>
        ) : (
          <ul className="entity-view__related-list">
            {boundActions.map((action) => (
              <li key={action.id}>
                <Link to={`/ontology-manager/action-types/${action.id}`}>{action.display_name}</Link>
                <span className="entity-view__related-meta">{action.api_name}</span>
              </li>
            ))}
          </ul>
        )}
      </EntityViewPanel>
      {fn.published_version_id ? (
        <EntityViewPanel title={t('functions.versions')}>
          <button type="button" className="btn btn-secondary" onClick={() => void onTestPublished()}>
            {t('functions.testPublished')}
          </button>
        </EntityViewPanel>
      ) : null}
    </>
  );
}

export function FunctionObservabilityTab() {
  const { t } = useTranslation('ontology');
  const { executions } = useFunctionDetail();

  return (
    <>
      <EntityViewHeader
        title={t('functions.observability')}
        subtitle={t('functions.recentExecutions')}
      />
      <EntityViewPanel>
        <div className="entity-view__embedded-table">
          <div className="ds-table-wrap ds-table-wrap--flush">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('functions.execStatus')}</th>
                  <th>{t('functions.execDuration')}</th>
                  <th>{t('functions.execTime')}</th>
                  <th>{t('functions.execError')}</th>
                </tr>
              </thead>
              <tbody>
                {executions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="console-table-empty">
                      {t('functions.noExecutions')}
                    </td>
                  </tr>
                ) : (
                  executions.map((ex) => (
                    <tr key={ex.id}>
                      <td>{ex.status}</td>
                      <td className="console-table-muted">
                        {ex.duration_ms != null ? `${ex.duration_ms}ms` : '—'}
                      </td>
                      <td className="console-table-muted">{new Date(ex.created_at).toLocaleString()}</td>
                      <td className="console-table-muted">{ex.error_message || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </EntityViewPanel>
    </>
  );
}
