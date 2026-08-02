import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '../../styles/design-system';
import { fetchObjectTypes, type ObjectTypeResponse } from '../../data/ontologyApi';
import {
  deleteOntologyActionType,
  fetchOntologyActionTypes,
  fetchOntologyFunctions,
  type OntologyActionTypeResponse,
  type OntologyFunctionResponse,
} from '../../data/ontologyFunctionsApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { ActionTypeCreateWizard } from './ActionTypeCreateWizard';
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
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
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
              <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
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
                      <Link
                        to={`/ontology-manager/action-types/${action.id}`}
                        className="ontology-manager-list__api-link"
                      >
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

      <ActionTypeCreateWizard
        open={showCreate}
        onClose={() => setShowCreate(false)}
        objectTypes={objectTypes}
        publishedFunctions={publishedFunctions}
        onCreated={() => void load()}
      />
    </div>
  );
}
