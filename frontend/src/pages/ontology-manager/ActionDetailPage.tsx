import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { fetchObjectTypes, type ObjectTypeResponse } from '../../data/ontologyApi';
import {
  fetchOntologyActionLogs,
  fetchOntologyActionType,
  fetchOntologyFunctions,
  updateOntologyActionType,
  type OntologyActionLogResponse,
  type OntologyActionTypeResponse,
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

type ActionDetailContext = {
  action: OntologyActionTypeResponse;
  logs: OntologyActionLogResponse[];
  objectTypeName: string;
  publishedFunctions: OntologyFunctionResponse[];
  displayName: string;
  setDisplayName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
  functionId: string;
  setFunctionId: (v: string) => void;
  saving: boolean;
  onSave: () => Promise<void>;
};

const ActionDetailCtx = createContext<ActionDetailContext | null>(null);

function useActionDetail(): ActionDetailContext {
  const ctx = useContext(ActionDetailCtx);
  if (!ctx) throw new Error('useActionDetail requires ActionDetailPage');
  return ctx;
}

export function ActionDetailPage() {
  const { t } = useTranslation('ontology');
  const { actionId = '' } = useParams();
  const [action, setAction] = useState<OntologyActionTypeResponse | null>(null);
  const [logs, setLogs] = useState<OntologyActionLogResponse[]>([]);
  const [objectTypes, setObjectTypes] = useState<ObjectTypeResponse[]>([]);
  const [functions, setFunctions] = useState<OntologyFunctionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');
  const [functionId, setFunctionId] = useState('');

  const publishedFunctions = useMemo(
    () => functions.filter((fn) => fn.published_version != null),
    [functions],
  );

  const objectTypeName = useMemo(() => {
    if (!action) return '—';
    return objectTypes.find((ot) => ot.id === action.object_type_id)?.name ?? action.object_type_id;
  }, [action, objectTypes]);

  const load = useCallback(async () => {
    if (!actionId) return;
    setLoading(true);
    try {
      const [at, logRows, typesRes, fnRes] = await Promise.all([
        fetchOntologyActionType(actionId),
        fetchOntologyActionLogs(actionId),
        fetchObjectTypes(),
        fetchOntologyFunctions(),
      ]);
      setAction(at);
      setLogs(logRows);
      setObjectTypes(typesRes.items);
      setFunctions(fnRes.items);
      setDisplayName(at.display_name);
      setDescription(at.description ?? '');
      setStatus(at.status);
      setFunctionId(at.function_id ?? '');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('actions.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [actionId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = useCallback(async () => {
    if (!actionId) return;
    const selectedFn = publishedFunctions.find((fn) => fn.id === functionId);
    setSaving(true);
    try {
      const updated = await updateOntologyActionType(actionId, {
        display_name: displayName.trim(),
        description: description.trim() || undefined,
        status,
        function_id: selectedFn?.id ?? null,
        function_version: selectedFn?.published_version ?? null,
      });
      setAction(updated);
      toast.success(t('actions.saved'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('actions.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [actionId, publishedFunctions, functionId, displayName, description, status, t]);

  const value = useMemo(
    () =>
      action
        ? {
            action,
            logs,
            objectTypeName,
            publishedFunctions,
            displayName,
            setDisplayName,
            description,
            setDescription,
            status,
            setStatus,
            functionId,
            setFunctionId,
            saving,
            onSave,
          }
        : null,
    [
      action,
      logs,
      objectTypeName,
      publishedFunctions,
      displayName,
      description,
      status,
      functionId,
      saving,
      onSave,
    ],
  );

  if (loading || !action || !value) {
    return <EntityViewLoading label={t('shared.loading')} />;
  }

  const base = `/ontology-manager/actions/${actionId}`;

  return (
    <ActionDetailCtx.Provider value={value}>
      <EntityViewShell
        backTo="/ontology-manager/actions"
        backLabel={t('actions.backToList')}
        kind={t('actions.kind')}
        title={action.display_name}
        meta={action.api_name}
        navItems={[
          { to: base, label: t('actions.overview'), end: true },
          { to: `${base}/rules`, label: t('actions.rules') },
          { to: `${base}/log`, label: t('actions.log') },
        ]}
      >
        <Outlet />
      </EntityViewShell>
    </ActionDetailCtx.Provider>
  );
}

export function ActionOverviewTab() {
  const { t } = useTranslation('ontology');
  const {
    action,
    objectTypeName,
    displayName,
    setDisplayName,
    description,
    setDescription,
    status,
    setStatus,
    saving,
    onSave,
  } = useActionDetail();

  return (
    <>
      <EntityViewHeader
        title={t('actions.overview')}
        subtitle={action.description || t('actions.noDescription')}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => void onSave()} disabled={saving}>
            <Save size={16} aria-hidden />
            {saving ? t('shared.saving') : t('shared.save')}
          </button>
        }
      />
      <EntityViewStats>
        <EntityViewStat label={t('actions.apiName')} value={action.api_name} />
        <EntityViewStat label={t('actions.objectType')} value={objectTypeName} />
        <EntityViewStat label={t('actions.ruleType')} value={action.rule_type} />
      </EntityViewStats>
      <EntityViewPanel title={t('actions.general')} description={t('actions.generalHint')}>
        <div className="entity-view__form">
          <EntityViewField label={t('actions.displayName')}>
            <input
              className="console-form-control"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </EntityViewField>
          <EntityViewField label={t('actions.description')}>
            <textarea
              className="console-form-control"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </EntityViewField>
          <EntityViewField label={t('actions.status')}>
            <select className="console-form-control" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">{t('actions.statusActive')}</option>
              <option value="inactive">{t('actions.statusInactive')}</option>
            </select>
          </EntityViewField>
        </div>
      </EntityViewPanel>
    </>
  );
}

export function ActionRulesTab() {
  const { t } = useTranslation('ontology');
  const {
    action,
    publishedFunctions,
    functionId,
    setFunctionId,
    saving,
    onSave,
  } = useActionDetail();

  return (
    <>
      <EntityViewHeader
        title={t('actions.rules')}
        subtitle={t('actions.rulesSubtitle')}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => void onSave()} disabled={saving}>
            <Save size={16} aria-hidden />
            {saving ? t('shared.saving') : t('shared.save')}
          </button>
        }
      />
      <EntityViewStats>
        <EntityViewStat label={t('actions.ruleType')} value={action.rule_type} />
      </EntityViewStats>
      <EntityViewPanel>
        <div className="entity-view__form">
          <EntityViewField
            label={t('actions.function')}
            hint={publishedFunctions.length === 0 ? t('actions.publishFirstHint') : undefined}
          >
            <select
              className="console-form-control"
              value={functionId}
              onChange={(e) => setFunctionId(e.target.value)}
            >
              <option value="">{t('actions.noFunction')}</option>
              {publishedFunctions.map((fn) => (
                <option key={fn.id} value={fn.id}>
                  {fn.api_name} (v{fn.published_version})
                </option>
              ))}
            </select>
          </EntityViewField>
        </div>
      </EntityViewPanel>
    </>
  );
}

export function ActionLogTab() {
  const { t } = useTranslation('ontology');
  const { logs } = useActionDetail();

  return (
    <>
      <EntityViewHeader title={t('actions.log')} subtitle={t('actions.recentLogs')} />
      <EntityViewPanel>
        <div className="entity-view__embedded-table">
          <div className="ds-table-wrap ds-table-wrap--flush">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('actions.logObject')}</th>
                  <th>{t('functions.execStatus')}</th>
                  <th>{t('functions.execTime')}</th>
                  <th>{t('actions.logError')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="console-table-empty">
                      {t('actions.noLogs')}
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id}>
                      <td className="console-table-muted">{log.object_id ?? '—'}</td>
                      <td>{log.status}</td>
                      <td className="console-table-muted">{new Date(log.created_at).toLocaleString()}</td>
                      <td className="console-table-muted">{log.error_message ?? '—'}</td>
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
