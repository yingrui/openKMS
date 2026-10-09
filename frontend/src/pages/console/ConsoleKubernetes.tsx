import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, Wifi, Loader2, Server, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBanner } from '../../components/ErrorBanner';
import {
  fetchKubernetesClusters,
  createKubernetesCluster,
  updateKubernetesCluster,
  deleteKubernetesCluster,
  testKubernetesCluster,
  type KubernetesClusterResponse,
} from '../../data/kubernetesClustersApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import {
  CheckRow,
  Dialog,
  EmptyState,
  FormField,
  TableRowActionButton,
  TableRowActionCell,
  TableRowActions,
} from '../../styles/design-system';
import '../ontology/ontology-admin.scss';

export function ConsoleKubernetes() {
  const { t } = useTranslation('console');
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [items, setItems] = useState<KubernetesClusterResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<KubernetesClusterResponse | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formNamespace, setFormNamespace] = useState('default');
  const [formKubeconfig, setFormKubeconfig] = useState('');
  const [formApiServer, setFormApiServer] = useState('');
  const [formInsecureSkipTls, setFormInsecureSkipTls] = useState(false);
  const [formDirectServiceAccess, setFormDirectServiceAccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchKubernetesClusters({ limit: 200, offset: 0 });
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('kubernetes.toastLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditItem(null);
    setFormName('');
    setFormDescription('');
    setFormNamespace('default');
    setFormKubeconfig('');
    setFormApiServer('');
    setFormInsecureSkipTls(false);
    setFormDirectServiceAccess(false);
    setShowForm(true);
  };

  const openEdit = (row: KubernetesClusterResponse) => {
    setEditItem(row);
    setFormName(row.name);
    setFormDescription(row.description ?? '');
    setFormNamespace(row.default_namespace || 'default');
    setFormKubeconfig('');
    setFormApiServer(row.api_server ?? '');
    setFormInsecureSkipTls(Boolean(row.options?.insecure_skip_tls_verify));
    setFormDirectServiceAccess(Boolean(row.options?.direct_service_access));
    setShowForm(true);
  };

  const closeForm = () => {
    if (!submitting) setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!formName.trim()) {
      toast.error(t('kubernetes.toastRequiredFields'));
      return;
    }
    if (!editItem && !formKubeconfig.trim()) {
      toast.error(t('kubernetes.toastKubeconfigRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const options = {
        insecure_skip_tls_verify: formInsecureSkipTls,
        direct_service_access: formDirectServiceAccess,
      };
      if (editItem) {
        await updateKubernetesCluster(editItem.id, {
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          default_namespace: formNamespace.trim() || 'default',
          kubeconfig: formKubeconfig.trim() || undefined,
          api_server: formApiServer.trim() || '',
          options,
        });
        toast.success(t('kubernetes.toastUpdated'));
      } else {
        await createKubernetesCluster({
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          default_namespace: formNamespace.trim() || 'default',
          kubeconfig: formKubeconfig.trim(),
          api_server: formApiServer.trim() || undefined,
          options,
        });
        toast.success(t('kubernetes.toastCreated'));
      }
      setShowForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('kubernetes.toastOperationFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !(await confirm({
        title: t('kubernetes.deleteTitle'),
        message: t('kubernetes.deleteConfirm'),
        confirmLabel: t('kubernetes.deleteTitle'),
        danger: true,
      }))
    )
      return;
    try {
      await deleteKubernetesCluster(id);
      toast.success(t('kubernetes.toastDeleted'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('kubernetes.toastDeleteFailed'));
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const res = await testKubernetesCluster(id);
      if (res.ok) {
        toast.success(t('kubernetes.toastConnectionOk'));
      } else {
        toast.error(res.message || t('kubernetes.toastConnectionFailed'));
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('kubernetes.toastTestFailed'));
    } finally {
      setTesting(null);
    }
  };

  const testStatusLabel = (row: KubernetesClusterResponse) => {
    if (row.last_test_ok === true) return t('kubernetes.testOk');
    if (row.last_test_ok === false) return t('kubernetes.testFailed');
    return t('kubernetes.dash');
  };

  const showEmptyState = !loading && items.length === 0;
  const canSubmit =
    Boolean(formName.trim()) &&
    !submitting &&
    (Boolean(editItem) || Boolean(formKubeconfig.trim()));

  return (
    <div className="ontology-admin">
      <header className="page-header">
        <div>
          <h1>{t('kubernetes.pageTitle')}</h1>
          <p className="page-subtitle">{t('kubernetes.subtitle')}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus size={18} aria-hidden />
          <span>{t('kubernetes.newCluster')}</span>
        </button>
      </header>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="ontology-admin-content">
        {loading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" aria-hidden />
            <p>{t('kubernetes.loading')}</p>
          </div>
        ) : showEmptyState ? (
          <EmptyState
            icon={<Server size={32} aria-hidden />}
            title={t('kubernetes.empty')}
            action={
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                <Plus size={16} aria-hidden />
                {t('kubernetes.newCluster')}
              </button>
            }
          />
        ) : (
          <div className="ds-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('kubernetes.colName')}</th>
                  <th>{t('kubernetes.colApiServer')}</th>
                  <th>{t('kubernetes.colNamespace')}</th>
                  <th>{t('kubernetes.colLastTest')}</th>
                  <TableRowActionCell as="th">{t('kubernetes.colActions')}</TableRowActionCell>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link to={`/console/kubernetes/${row.id}`} className="console-table-link">
                        <strong>{row.name}</strong>
                      </Link>
                      {row.description ? (
                        <div className="console-table-muted">{row.description}</div>
                      ) : null}
                    </td>
                    <td>{row.api_server ?? t('kubernetes.dash')}</td>
                    <td>{row.default_namespace}</td>
                    <td>{testStatusLabel(row)}</td>
                    <TableRowActionCell>
                      <TableRowActions>
                        <TableRowActionButton
                          title={t('kubernetes.browseTitle')}
                          aria-label={t('kubernetes.browseTitle')}
                          icon={<ExternalLink size={16} aria-hidden />}
                          onClick={() => navigate(`/console/kubernetes/${row.id}`)}
                        />
                        <TableRowActionButton
                          title={t('kubernetes.testTitle')}
                          aria-label={t('kubernetes.testTitle')}
                          icon={<Wifi size={16} aria-hidden />}
                          onClick={() => void handleTest(row.id)}
                          loading={testing === row.id}
                        />
                        <TableRowActionButton
                          title={t('kubernetes.editTitle')}
                          aria-label={t('kubernetes.editTitle')}
                          icon={<Pencil size={16} aria-hidden />}
                          onClick={() => openEdit(row)}
                        />
                        <TableRowActionButton
                          title={t('kubernetes.deleteTitle')}
                          aria-label={t('kubernetes.deleteTitle')}
                          icon={<Trash2 size={16} aria-hidden />}
                          onClick={() => void handleDelete(row.id)}
                          variant="danger"
                        />
                      </TableRowActions>
                    </TableRowActionCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={showForm}
        onClose={closeForm}
        closeDisabled={submitting}
        title={editItem ? t('kubernetes.modalEditTitle') : t('kubernetes.modalNewTitle')}
        closeAriaLabel={t('kubernetes.closeAria')}
        size="md"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closeForm}
              disabled={submitting}
            >
              {t('kubernetes.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
            >
              {submitting
                ? t('kubernetes.saving')
                : editItem
                  ? t('kubernetes.update')
                  : t('kubernetes.create')}
            </button>
          </>
        }
      >
        <FormField label={t('kubernetes.fieldName')}>
          <input
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder={t('kubernetes.placeholderName')}
            autoFocus
            disabled={submitting}
          />
        </FormField>
        <FormField label={t('kubernetes.fieldDescription')}>
          <input
            type="text"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder={t('kubernetes.placeholderDescription')}
            disabled={submitting}
          />
        </FormField>
        <FormField label={t('kubernetes.fieldNamespace')}>
          <input
            type="text"
            value={formNamespace}
            onChange={(e) => setFormNamespace(e.target.value)}
            placeholder="default"
            disabled={submitting}
          />
        </FormField>
        <FormField
          label={t('kubernetes.fieldApiServer')}
          hint={t('kubernetes.apiServerHint')}
        >
          <input
            type="url"
            value={formApiServer}
            onChange={(e) => setFormApiServer(e.target.value)}
            placeholder={t('kubernetes.placeholderApiServer')}
            disabled={submitting}
            spellCheck={false}
          />
        </FormField>
        <FormField
          label={
            editItem
              ? `${t('kubernetes.fieldKubeconfig')} ${t('kubernetes.kubeconfigLeaveBlank')}`
              : t('kubernetes.fieldKubeconfig')
          }
          hint={t('kubernetes.kubeconfigHint')}
        >
          <textarea
            className="ds-control--mono"
            value={formKubeconfig}
            onChange={(e) => setFormKubeconfig(e.target.value)}
            placeholder={
              editItem
                ? t('kubernetes.placeholderKubeconfigEdit')
                : t('kubernetes.placeholderKubeconfigNew')
            }
            rows={10}
            disabled={submitting}
            spellCheck={false}
          />
        </FormField>
        <CheckRow
          checked={formInsecureSkipTls}
          onChange={setFormInsecureSkipTls}
          title={t('kubernetes.fieldInsecureSkipTls')}
        />
        <CheckRow
          checked={formDirectServiceAccess}
          onChange={setFormDirectServiceAccess}
          title={t('kubernetes.fieldDirectServiceAccess')}
          hint={t('kubernetes.fieldDirectServiceAccessHint')}
        />
      </Dialog>
    </div>
  );
}
