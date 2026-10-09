import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Save, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { fetchObjectTypes, type ObjectTypeResponse } from '../../data/ontologyApi';
import {
  executeOntologyFunction,
  fetchFunctionExecutions,
  fetchOntologyActionTypes,
  fetchOntologyFunction,
  publishOntologyFunction,
  updateOntologyFunction,
  type OntologyActionTypeResponse,
  type OntologyFunctionExecutionResponse,
  type OntologyFunctionResponse,
} from '../../data/ontologyFunctionsApi';
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
  boundActions: OntologyActionTypeResponse[];
  objectTypeId: string;
  setObjectTypeId: (v: string) => void;
  publishing: boolean;
  saving: boolean;
  onPublish: () => Promise<void>;
  onTestPublished: () => Promise<void>;
  onSave: () => Promise<void>;
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
  const [boundActions, setBoundActions] = useState<OntologyActionTypeResponse[]>([]);
  const [objectTypeId, setObjectTypeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!functionId) return;
    setLoading(true);
    try {
      const [f, ex, typesRes, actions] = await Promise.all([
        fetchOntologyFunction(functionId),
        fetchFunctionExecutions(functionId),
        fetchObjectTypes(),
        fetchOntologyActionTypes(),
      ]);
      setFn(f);
      setExecutions(ex);
      setObjectTypes(typesRes.items);
      setObjectTypeId(f.object_type_id ?? '');
      setBoundActions(actions.filter((a) => a.function_id === functionId));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('functions.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [functionId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onPublish = useCallback(async () => {
    if (!functionId) return;
    setPublishing(true);
    try {
      const updated = await publishOntologyFunction(functionId);
      setFn(updated);
      toast.success(t('functions.published'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('functions.publishFailed'));
    } finally {
      setPublishing(false);
    }
  }, [functionId, t]);

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

  const value = useMemo(
    () =>
      fn
        ? {
            fn,
            executions,
            objectTypes,
            boundActions,
            objectTypeId,
            setObjectTypeId,
            publishing,
            saving,
            onPublish,
            onTestPublished,
            onSave,
            reload: load,
          }
        : null,
    [
      fn,
      executions,
      objectTypes,
      boundActions,
      objectTypeId,
      publishing,
      saving,
      onPublish,
      onTestPublished,
      onSave,
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

export function FunctionOverviewTab() {
  const { t } = useTranslation('ontology');
  const {
    fn,
    objectTypes,
    boundActions,
    objectTypeId,
    setObjectTypeId,
    publishing,
    saving,
    onPublish,
    onTestPublished,
    onSave,
  } = useFunctionDetail();

  const objectTypeName =
    objectTypes.find((ot) => ot.id === (fn.object_type_id ?? ''))?.name ??
    (fn.object_type_id ? fn.object_type_id : '—');

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
