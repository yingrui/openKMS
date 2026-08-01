import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Trash2, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '../../styles/design-system';
import { fetchObjectTypes, type ObjectTypeResponse } from '../../data/ontologyApi';
import {
  createOntologyActionType,
  deleteOntologyActionType,
  fetchOntologyActionTypes,
  fetchOntologyFunctions,
  type OntologyActionTypeResponse,
  type OntologyFunctionResponse,
} from '../../data/ontologyFunctionsApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import '../ontology/ontology-admin.scss';

function statusBadgeClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === 'active' || normalized === 'published') {
    return 'ontology-status-badge ontology-status-badge--active';
  }
  return 'ontology-status-badge';
}

export function ActionsListPage() {
  const { t } = useTranslation('ontology');
  const confirm = useConfirm();
  const [items, setItems] = useState<OntologyActionTypeResponse[]>([]);
  const [objectTypes, setObjectTypes] = useState<ObjectTypeResponse[]>([]);
  const [functions, setFunctions] = useState<OntologyFunctionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [apiName, setApiName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [objectTypeId, setObjectTypeId] = useState('');
  const [functionId, setFunctionId] = useState('');

  const publishedFunctions = useMemo(
    () => functions.filter((fn) => fn.published_version != null),
    [functions],
  );

  const objectTypeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const ot of objectTypes) map.set(ot.id, ot.name);
    return map;
  }, [objectTypes]);

  const functionNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const fn of functions) map.set(fn.id, fn.api_name);
    return map;
  }, [functions]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [actions, typesRes, fnRes] = await Promise.all([
        fetchOntologyActionTypes(),
        fetchObjectTypes(),
        fetchOntologyFunctions(),
      ]);
      setItems(actions);
      setObjectTypes(typesRes.items);
      setFunctions(fnRes.items);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('actions.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setApiName('');
    setDisplayName('');
    setDescription('');
    setObjectTypeId(objectTypes[0]?.id ?? '');
    setFunctionId('');
    setShowCreate(true);
  };

  const onCreate = async () => {
    if (!apiName.trim() || !displayName.trim() || !objectTypeId) {
      toast.error(t('actions.formRequired'));
      return;
    }
    const selectedFn = publishedFunctions.find((fn) => fn.id === functionId);
    setSubmitting(true);
    try {
      await createOntologyActionType({
        api_name: apiName.trim(),
        display_name: displayName.trim(),
        description: description.trim() || undefined,
        object_type_id: objectTypeId,
        rule_type: 'function',
        function_id: selectedFn?.id,
        function_version: selectedFn?.published_version ?? undefined,
      });
      toast.success(t('actions.created'));
      setShowCreate(false);
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('actions.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (action: OntologyActionTypeResponse) => {
    if (
      !(await confirm({
        title: t('shared.delete'),
        message: t('actions.deleteConfirm', { name: action.display_name }),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    try {
      await deleteOntologyActionType(action.id);
      toast.success(t('actions.deleted'));
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('actions.createFailed'));
    }
  };

  return (
    <div className="ontology-admin">
      <header className="page-header">
        <div>
          <h1>{t('actions.title')}</h1>
          <p className="page-subtitle">{t('actions.subtitle')}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} aria-hidden />
          {t('actions.create')}
        </button>
      </header>

      <div className="ontology-admin-content">
        {loading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" aria-hidden />
            <p>{t('shared.loading')}</p>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Zap size={32} aria-hidden />}
            title={t('actions.emptyList')}
            description={t('actions.createHint')}
            action={
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                <Plus size={16} aria-hidden />
                {t('actions.create')}
              </button>
            }
          />
        ) : (
          <div className="ds-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('actions.apiName')}</th>
                  <th>{t('actions.displayName')}</th>
                  <th>{t('actions.objectType')}</th>
                  <th>{t('actions.function')}</th>
                  <th>{t('actions.status')}</th>
                  <th className="console-table-actions">{t('shared.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((action) => (
                  <tr key={action.id}>
                    <td>
                      <Link to={`/ontology-manager/actions/${action.id}`} className="ontology-manager-list__api-link">
                        {action.api_name}
                      </Link>
                    </td>
                    <td>{action.display_name}</td>
                    <td className="console-table-muted">
                      {objectTypeNameById.get(action.object_type_id) ?? action.object_type_id}
                    </td>
                    <td className="console-table-muted">
                      {action.function_id
                        ? functionNameById.get(action.function_id) ?? action.function_id
                        : '—'}
                    </td>
                    <td>
                      <span className={statusBadgeClass(action.status)}>{action.status}</span>
                    </td>
                    <td className="console-table-actions">
                      <div className="console-table-btns">
                        <button
                          type="button"
                          onClick={() => void onDelete(action)}
                          aria-label={t('shared.delete')}
                          title={t('shared.delete')}
                        >
                          <Trash2 size={16} aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <div
          className="console-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && !submitting && setShowCreate(false)}
        >
          <div className="console-modal console-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="console-modal-header">
              <h2>{t('actions.create')}</h2>
              <button type="button" onClick={() => setShowCreate(false)} disabled={submitting} aria-label={t('shared.cancel')}>
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="console-modal-body">
              <p className="console-modal-hint">{t('actions.createHint')}</p>
              <label className="console-form-field">
                <span>{t('actions.apiName')}</span>
                <input
                  type="text"
                  className="console-form-control"
                  value={apiName}
                  onChange={(e) => setApiName(e.target.value)}
                  placeholder="submitClaim"
                  autoFocus
                />
              </label>
              <label className="console-form-field">
                <span>{t('actions.displayName')}</span>
                <input
                  type="text"
                  className="console-form-control"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('actions.displayName')}
                />
              </label>
              <label className="console-form-field">
                <span>{t('actions.objectType')}</span>
                <select
                  className="console-form-control"
                  value={objectTypeId}
                  onChange={(e) => setObjectTypeId(e.target.value)}
                >
                  {objectTypes.length === 0 ? (
                    <option value="">{t('actions.noObjectTypes')}</option>
                  ) : (
                    objectTypes.map((ot) => (
                      <option key={ot.id} value={ot.id}>
                        {ot.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="console-form-field">
                <span>{t('actions.function')}</span>
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
                {publishedFunctions.length === 0 && (
                  <span className="console-modal-hint">{t('actions.publishFirstHint')}</span>
                )}
              </label>
              <label className="console-form-field">
                <span>{t('actions.description')}</span>
                <input
                  type="text"
                  className="console-form-control"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
            </div>
            <div className="console-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)} disabled={submitting}>
                {t('shared.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void onCreate()}
                disabled={submitting || !apiName.trim() || !displayName.trim() || !objectTypeId}
              >
                {submitting ? t('shared.saving') : t('actions.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
