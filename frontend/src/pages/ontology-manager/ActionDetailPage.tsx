import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
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
import '../ontology/ontology-admin.scss';
import './entity-view.scss';

type Tab = 'overview' | 'logs';

export function ActionDetailPage() {
  const { t } = useTranslation('ontology');
  const { actionId = '' } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
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

  const onSave = async () => {
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
  };

  if (loading || !action) {
    return (
      <div className="console-loading">
        <Loader2 size={32} className="console-loading-spinner" aria-hidden />
        <p>{t('shared.loading')}</p>
      </div>
    );
  }

  return (
    <div className="entity-view">
      <aside className="entity-view__sidebar">
        <button type="button" className="entity-view__back" onClick={() => navigate('/ontology-manager/actions')}>
          <ArrowLeft size={16} aria-hidden />
          {t('actions.backToList')}
        </button>
        <h2 className="entity-view__title">{action.display_name}</h2>
        <p className="entity-view__meta">{action.api_name}</p>
        <nav className="entity-view__nav">
          <button
            type="button"
            className={`entity-view__nav-item${tab === 'overview' ? ' entity-view__nav-item--active' : ''}`}
            onClick={() => setTab('overview')}
          >
            {t('actions.overview')}
          </button>
          <button
            type="button"
            className={`entity-view__nav-item${tab === 'logs' ? ' entity-view__nav-item--active' : ''}`}
            onClick={() => setTab('logs')}
          >
            {t('actions.logs')}
          </button>
        </nav>
      </aside>
      <div className="entity-view__main">
        {tab === 'overview' ? (
          <>
            <header className="page-header">
              <div>
                <h1>{action.display_name}</h1>
                <p className="page-subtitle">{action.description || t('actions.noDescription')}</p>
              </div>
              <div className="entity-view__actions">
                <button type="button" className="btn btn-primary" onClick={() => void onSave()} disabled={saving}>
                  <Save size={16} aria-hidden />
                  {saving ? t('shared.saving') : t('shared.save')}
                </button>
              </div>
            </header>
            <dl className="entity-view__dl">
              <dt>{t('actions.apiName')}</dt>
              <dd className="ontology-manager-list__api-link">{action.api_name}</dd>
              <dt>{t('actions.objectType')}</dt>
              <dd>{objectTypeName}</dd>
              <dt>{t('actions.ruleType')}</dt>
              <dd>{action.rule_type}</dd>
            </dl>
            <div className="entity-view__form">
              <label className="console-form-field">
                <span>{t('actions.displayName')}</span>
                <input
                  className="console-form-control"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </label>
              <label className="console-form-field">
                <span>{t('actions.description')}</span>
                <input
                  className="console-form-control"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <label className="console-form-field">
                <span>{t('actions.function')}</span>
                <select className="console-form-control" value={functionId} onChange={(e) => setFunctionId(e.target.value)}>
                  <option value="">{t('actions.noFunction')}</option>
                  {publishedFunctions.map((fn) => (
                    <option key={fn.id} value={fn.id}>
                      {fn.api_name} (v{fn.published_version})
                    </option>
                  ))}
                </select>
              </label>
              <label className="console-form-field">
                <span>{t('actions.status')}</span>
                <select className="console-form-control" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="active">{t('actions.statusActive')}</option>
                  <option value="inactive">{t('actions.statusInactive')}</option>
                </select>
              </label>
            </div>
          </>
        ) : (
          <section className="entity-view__section">
            <h3>{t('actions.recentLogs')}</h3>
            <div className="ontology-admin-table-wrap">
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
          </section>
        )}
      </div>
    </div>
  );
}
