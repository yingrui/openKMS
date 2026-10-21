import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Loader2, Pencil, Plug, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '../../styles/design-system';
import { useConfirm } from '../../contexts/ConfirmContext';
import {
  deleteExternalService,
  fetchClusterOptions,
  fetchExternalServices,
  type ExternalServiceResponse,
  type K8sClusterOption,
} from '../../data/externalServicesApi';
import { ExternalServiceFormDialog } from './ExternalServiceFormDialog';
import '../ontology/ontology-admin.scss';
import './function-editor.scss';
import './external-services.scss';

/**
 * The external services a Function may call, managed as a page rather than a modal off one Function.
 *
 * It is authoring infrastructure, so it lives in the Function Editor app next to the Functions that
 * use it — but it is reachable on its own, deep-linkable, and shows what would break if an entry were
 * removed.
 */
export function ExternalServicesPage() {
  const { t } = useTranslation('ontology');
  const confirm = useConfirm();
  const [services, setServices] = useState<ExternalServiceResponse[]>([]);
  const [clusters, setClusters] = useState<K8sClusterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ExternalServiceResponse | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, clusterRows] = await Promise.all([
        fetchExternalServices(),
        fetchClusterOptions(),
      ]);
      setServices(rows);
      setClusters(clusterRows);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('editor.external.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (service: ExternalServiceResponse) => {
    setEditing(service);
    setFormOpen(true);
  };

  const onDelete = async (service: ExternalServiceResponse) => {
    // Deleting a service that a Function's source mentions breaks that call, so say so first.
    const users = service.used_by.map((f) => f.api_name).join(', ');
    const message = users
      ? t('editor.external.deleteInUse', { functions: users })
      : t('editor.external.deleteConfirm', { name: service.api_name });
    if (
      !(await confirm({
        title: t('editor.external.deleteTitle', { name: service.api_name }),
        message,
        confirmLabel: t('shared.delete'),
        danger: service.used_by.length > 0,
      }))
    ) {
      return;
    }
    try {
      await deleteExternalService(service.id);
      toast.success(t('editor.external.deleted'));
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('editor.external.deleteFailed'));
    }
  };

  const clusterName = (id?: string | null) =>
    clusters.find((c) => c.id === id)?.name || (id ? id.slice(0, 8) : '—');

  return (
    <div className="ontology-admin function-editor-list">
      <header className="page-header">
        <div>
          <h1>{t('editor.external.title')}</h1>
          <p className="page-subtitle">{t('editor.external.pageSubtitle')}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} aria-hidden />
          {t('editor.external.add')}
        </button>
      </header>

      <div className="ontology-admin-content">
        {loading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" aria-hidden />
            <p>{t('shared.loading')}</p>
          </div>
        ) : services.length === 0 ? (
          <EmptyState
            icon={<Plug size={32} aria-hidden />}
            title={t('editor.external.empty')}
            description={t('editor.external.emptyHint')}
            action={
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                <Plus size={16} aria-hidden />
                {t('editor.external.add')}
              </button>
            }
          />
        ) : (
          <div className="ds-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('editor.external.apiName')}</th>
                  <th>{t('editor.external.kind')}</th>
                  <th>{t('editor.external.target')}</th>
                  <th>{t('editor.external.auth')}</th>
                  <th>{t('editor.external.allowedPaths')}</th>
                  <th>{t('editor.external.usedBy')}</th>
                  <th className="console-table-actions">{t('shared.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr key={service.id}>
                    <td>
                      <code>{service.api_name}</code>
                      <div className="external-services__name">{service.display_name}</div>
                    </td>
                    <td>
                      <span
                        className={`external-services__kind external-services__kind--${service.kind}`}
                      >
                        {service.kind === 'k8s_service'
                          ? t('editor.external.kindK8s')
                          : t('editor.external.kindHttp')}
                      </span>
                    </td>
                    <td>
                      {service.kind === 'k8s_service' ? (
                        <code title={service.cluster_id || undefined}>
                          {clusterName(service.cluster_id)}:{service.namespace}/{service.service}:
                          {service.port}
                          {service.base_path || ''}
                        </code>
                      ) : (
                        <code>{(service.base_url || '—') + (service.base_path || '')}</code>
                      )}
                    </td>
                    <td>{service.auth_kind === 'none' ? '—' : service.auth_kind}</td>
                    <td>
                      <code>{service.allowed_paths.join(' ')}</code>
                    </td>
                    <td>
                      {service.used_by.length === 0 ? (
                        <span className="external-services__name">
                          {t('editor.external.usedByNone')}
                        </span>
                      ) : (
                        service.used_by.map((fn, i) => (
                          <span key={fn.id}>
                            {i > 0 ? ', ' : ''}
                            <Link to={`/function-editor/${fn.id}`}>{fn.api_name}</Link>
                          </span>
                        ))
                      )}
                    </td>
                    <td className="console-table-actions">
                      <div className="console-table-btns">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => openEdit(service)}
                          aria-label={t('shared.edit')}
                        >
                          <Pencil size={14} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => void onDelete(service)}
                          aria-label={t('shared.delete')}
                        >
                          <Trash2 size={14} aria-hidden />
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

      <ExternalServiceFormDialog
        open={formOpen}
        service={editing}
        onClose={() => setFormOpen(false)}
        onSaved={load}
      />
    </div>
  );
}
