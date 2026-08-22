import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
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
import {
  isBuiltinObjectRule,
  writableFieldsFromParameters,
} from './actionRuleTypes';
import '../ontology/ontology-admin.scss';

type ActionDetailContext = {
  action: OntologyActionTypeResponse;
  logs: OntologyActionLogResponse[];
  objectType: ObjectTypeResponse | null;
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
  writableFields: string[];
  setWritableFields: Dispatch<SetStateAction<string[]>>;
  saving: boolean;
  onSave: () => Promise<void>;
};

const ActionDetailCtx = createContext<ActionDetailContext | null>(null);

function useActionDetail(): ActionDetailContext {
  const ctx = useContext(ActionDetailCtx);
  if (!ctx) throw new Error('useActionDetail requires ActionDetailPage');
  return ctx;
}

function allPropertyNames(ot: ObjectTypeResponse | null): string[] {
  return (ot?.properties ?? []).map((p) => p.name).filter(Boolean);
}

export function ActionDetailPage() {
  const { t } = useTranslation('ontology');
  const { actionTypeId = '', actionId: legacyActionId = '' } = useParams();
  const actionId = actionTypeId || legacyActionId;
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
  const [writableFields, setWritableFields] = useState<string[]>([]);

  const publishedFunctions = useMemo(
    () => functions.filter((fn) => fn.published_version != null),
    [functions],
  );

  const objectType = useMemo(() => {
    if (!action) return null;
    return objectTypes.find((ot) => ot.id === action.object_type_id) ?? null;
  }, [action, objectTypes]);

  const objectTypeName = objectType?.name ?? action?.object_type_id ?? '—';

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
      const ot = typesRes.items.find((row) => row.id === at.object_type_id) ?? null;
      const savedFields = writableFieldsFromParameters(at.parameters);
      setWritableFields(savedFields.length ? savedFields : allPropertyNames(ot));
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
    if (!actionId || !action) return;
    const selectedFn = publishedFunctions.find((fn) => fn.id === functionId);
    const isBuiltin = isBuiltinObjectRule(action.rule_type);
    setSaving(true);
    try {
      const body: Parameters<typeof updateOntologyActionType>[1] = {
        display_name: displayName.trim(),
        description: description.trim() || undefined,
        status,
      };
      if (isBuiltin) {
        body.function_id = null;
        body.function_version = null;
        const allNames = allPropertyNames(objectType);
        const fields =
          writableFields.length && writableFields.length < allNames.length
            ? writableFields
            : undefined;
        body.parameters = fields ? { fields } : {};
      } else {
        body.function_id = selectedFn?.id ?? null;
        body.function_version = selectedFn?.published_version ?? null;
      }
      const updated = await updateOntologyActionType(actionId, body);
      setAction(updated);
      toast.success(t('actions.saved'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('actions.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [
    actionId,
    action,
    publishedFunctions,
    functionId,
    displayName,
    description,
    status,
    objectType,
    writableFields,
    t,
  ]);

  const value = useMemo(
    () =>
      action
        ? {
            action,
            logs,
            objectType,
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
            writableFields,
            setWritableFields,
            saving,
            onSave,
          }
        : null,
    [
      action,
      logs,
      objectType,
      objectTypeName,
      publishedFunctions,
      displayName,
      description,
      status,
      functionId,
      writableFields,
      saving,
      onSave,
    ],
  );

  if (loading || !action || !value) {
    return <EntityViewLoading label={t('shared.loading')} />;
  }

  const base = `/ontology-manager/action-types/${actionId}`;

  return (
    <ActionDetailCtx.Provider value={value}>
      <EntityViewShell
        backTo="/ontology-manager/action-types"
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
        <EntityViewStat
          label={t('actions.ruleType')}
          value={t(`actions.ruleTypeLabel.${action.rule_type}`, { defaultValue: action.rule_type })}
        />
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
    objectType,
    publishedFunctions,
    functionId,
    setFunctionId,
    writableFields,
    setWritableFields,
    saving,
    onSave,
  } = useActionDetail();

  const isBuiltin = isBuiltinObjectRule(action.rule_type);
  const propertyNames = allPropertyNames(objectType);

  const toggleField = (name: string) => {
    setWritableFields((prev) => {
      if (prev.includes(name)) return prev.filter((f) => f !== name);
      return [...prev, name];
    });
  };

  return (
    <>
      <EntityViewHeader
        title={t('actions.rules')}
        subtitle={
          isBuiltin ? t('actions.rulesBuiltinSubtitle') : t('actions.rulesFunctionSubtitle')
        }
        actions={
          <button type="button" className="btn btn-primary" onClick={() => void onSave()} disabled={saving}>
            <Save size={16} aria-hidden />
            {saving ? t('shared.saving') : t('shared.save')}
          </button>
        }
      />
      <EntityViewStats>
        <EntityViewStat
          label={t('actions.ruleType')}
          value={t(`actions.ruleTypeLabel.${action.rule_type}`, { defaultValue: action.rule_type })}
        />
      </EntityViewStats>
      <EntityViewPanel>
        {isBuiltin ? (
          <div className="entity-view__form">
            <p className="console-modal-hint">
              {t(`actions.builtinRulesHint.${action.rule_type}`, {
                defaultValue: t('actions.builtinRulesHint.default'),
              })}
            </p>
            {action.rule_type !== 'object_delete' && propertyNames.length > 0 ? (
              <fieldset className="object-type-create-wizard__intent">
                <legend>{t('actions.writableFields')}</legend>
                <p className="console-modal-hint">{t('actions.writableFieldsHint')}</p>
                <ul className="object-type-create-wizard__action-list">
                  {propertyNames.map((name) => (
                    <li key={name}>
                      <label className="object-type-create-wizard__checkbox">
                        <input
                          type="checkbox"
                          className="ds-checkbox"
                          checked={writableFields.includes(name)}
                          onChange={() => toggleField(name)}
                        />
                        <span>{name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            ) : null}
          </div>
        ) : (
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
            <p className="console-modal-hint">{t('actions.functionCustomHint')}</p>
          </div>
        )}
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
