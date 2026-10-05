import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, FilePlus2, FileText, Loader2, RefreshCw, Trash2, AppWindow } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBanner } from '../../components/ErrorBanner';
import { createApp } from '../../data/appBuilderApi';
import {
  applyClusterManifests,
  deleteClusterResource,
  fetchClusterDeployments,
  fetchClusterNamespaces,
  fetchClusterPodLogs,
  fetchClusterPods,
  fetchClusterServices,
  fetchKubernetesCluster,
  type KubernetesClusterResponse,
  type KubernetesDeploymentItem,
  type KubernetesNamespaceItem,
  type KubernetesPodItem,
  type KubernetesServiceItem,
} from '../../data/kubernetesClustersApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import {
  Dialog,
  EmptyState,
  FormField,
  TableRowActionButton,
  TableRowActionCell,
  TableRowActions,
} from '../../styles/design-system';
import '../ontology/ontology-admin.scss';

function suggestApiName(service: string): string {
  const cleaned = service.replace(/[^a-zA-Z0-9_]/g, '_');
  const withLetter = /^[a-zA-Z]/.test(cleaned) ? cleaned : `svc_${cleaned}`;
  return withLetter.slice(0, 128);
}

function firstPort(svc: KubernetesServiceItem): number {
  if (svc.port_numbers && svc.port_numbers.length > 0) return svc.port_numbers[0];
  const m = (svc.ports || '').match(/(\d+)/);
  return m ? Number(m[1]) : 80;
}

export function ConsoleKubernetesDetail() {
  const { t } = useTranslation('console');
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { clusterId = '' } = useParams<{ clusterId: string }>();
  const [cluster, setCluster] = useState<KubernetesClusterResponse | null>(null);
  const [namespaces, setNamespaces] = useState<KubernetesNamespaceItem[]>([]);
  const [namespace, setNamespace] = useState('');
  const [deployments, setDeployments] = useState<KubernetesDeploymentItem[]>([]);
  const [services, setServices] = useState<KubernetesServiceItem[]>([]);
  const [pods, setPods] = useState<KubernetesPodItem[]>([]);
  const [loadingCluster, setLoadingCluster] = useState(true);
  const [loadingResources, setLoadingResources] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [logsOpen, setLogsOpen] = useState(false);
  const [logsPod, setLogsPod] = useState<string | null>(null);
  const [logsTail, setLogsTail] = useState(200);
  const [logsText, setLogsText] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);

  const [applyOpen, setApplyOpen] = useState(false);
  const [applyYaml, setApplyYaml] = useState('');
  const [applyNs, setApplyNs] = useState('');
  const [applySubmitting, setApplySubmitting] = useState(false);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerSvc, setRegisterSvc] = useState<KubernetesServiceItem | null>(null);
  const [registerName, setRegisterName] = useState('');
  const [registerApiName, setRegisterApiName] = useState('');
  const [registerPort, setRegisterPort] = useState(80);
  const [registerSubmitting, setRegisterSubmitting] = useState(false);

  const loadCluster = useCallback(async () => {
    if (!clusterId) return;
    setLoadingCluster(true);
    setError(null);
    try {
      const row = await fetchKubernetesCluster(clusterId);
      setCluster(row);
      setNamespace(row.default_namespace || 'default');
      try {
        const nsRes = await fetchClusterNamespaces(clusterId);
        setNamespaces(nsRes.items);
      } catch {
        setNamespaces([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('kubernetes.toastLoadFailed'));
      setCluster(null);
    } finally {
      setLoadingCluster(false);
    }
  }, [clusterId, t]);

  const loadResources = useCallback(async () => {
    if (!clusterId || !namespace) return;
    setLoadingResources(true);
    setError(null);
    try {
      const [depRes, podRes, svcRes] = await Promise.all([
        fetchClusterDeployments(clusterId, namespace),
        fetchClusterPods(clusterId, namespace),
        fetchClusterServices(clusterId, namespace),
      ]);
      setDeployments(depRes.items);
      setPods(podRes.items);
      setServices(svcRes.items);
    } catch (e) {
      setDeployments([]);
      setPods([]);
      setServices([]);
      setError(e instanceof Error ? e.message : t('kubernetes.browseLoadFailed'));
    } finally {
      setLoadingResources(false);
    }
  }, [clusterId, namespace, t]);

  useEffect(() => {
    void loadCluster();
  }, [loadCluster]);

  useEffect(() => {
    if (!loadingCluster && cluster && namespace) {
      void loadResources();
    }
  }, [loadingCluster, cluster, namespace, loadResources]);

  const handleDelete = async (kind: string, name: string) => {
    const ok = await confirm({
      title: t('kubernetes.deleteResourceTitle'),
      message: t('kubernetes.deleteResourceConfirm', { kind, name, namespace }),
      confirmLabel: t('kubernetes.deleteTitle'),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteClusterResource(clusterId, { kind, name, namespace });
      toast.success(t('kubernetes.toastResourceDeleted'));
      await loadResources();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('kubernetes.toastOperationFailed'));
    }
  };

  const openLogs = (pod: string) => {
    setLogsPod(pod);
    setLogsText('');
    setLogsTail(200);
    setLogsOpen(true);
  };

  const loadLogs = useCallback(async () => {
    if (!clusterId || !logsPod) return;
    setLogsLoading(true);
    try {
      const res = await fetchClusterPodLogs(clusterId, logsPod, {
        namespace,
        tail: logsTail,
      });
      setLogsText(res.log || '');
    } catch (e) {
      setLogsText('');
      toast.error(e instanceof Error ? e.message : t('kubernetes.toastLogsFailed'));
    } finally {
      setLogsLoading(false);
    }
  }, [clusterId, logsPod, namespace, logsTail, t]);

  useEffect(() => {
    if (logsOpen && logsPod) {
      void loadLogs();
    }
  }, [logsOpen, logsPod, loadLogs]);

  const handleApply = async () => {
    if (!applyYaml.trim()) {
      toast.error(t('kubernetes.toastApplyEmpty'));
      return;
    }
    setApplySubmitting(true);
    try {
      const res = await applyClusterManifests(clusterId, {
        yaml: applyYaml,
        namespace: applyNs.trim() || namespace,
      });
      const summary = res.items.map((i) => `${i.kind}/${i.name} ${i.action}`).join(', ');
      toast.success(summary || t('kubernetes.toastApplied'));
      setApplyOpen(false);
      setApplyYaml('');
      await loadResources();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('kubernetes.toastOperationFailed'));
    } finally {
      setApplySubmitting(false);
    }
  };

  const openRegister = (svc: KubernetesServiceItem) => {
    setRegisterSvc(svc);
    setRegisterName(svc.name);
    setRegisterApiName(suggestApiName(svc.name));
    setRegisterPort(firstPort(svc));
    setRegisterOpen(true);
  };

  const handleRegister = async () => {
    if (!registerSvc || !registerName.trim() || !registerApiName.trim()) {
      toast.error(t('kubernetes.toastRegisterFields'));
      return;
    }
    setRegisterSubmitting(true);
    try {
      const app = await createApp({
        name: registerName.trim(),
        api_name: registerApiName.trim(),
        template_id: 'module',
        bindings: {
          k8s: {
            cluster_id: clusterId,
            namespace,
            service: registerSvc.name,
            port: registerPort,
          },
        },
      });
      toast.success(t('kubernetes.toastRegisteredApp'));
      setRegisterOpen(false);
      navigate(`/apps/${app.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('kubernetes.toastRegisterFailed'));
    } finally {
      setRegisterSubmitting(false);
    }
  };

  if (loadingCluster) {
    return (
      <div className="ontology-admin">
        <div className="console-loading">
          <Loader2 size={32} className="console-loading-spinner" aria-hidden />
          <p>{t('kubernetes.loading')}</p>
        </div>
      </div>
    );
  }

  if (!cluster) {
    return (
      <div className="ontology-admin">
        <EmptyState
          title={t('kubernetes.detailNotFound')}
          action={
            <Link to="/console/kubernetes" className="btn btn-secondary">
              <ArrowLeft size={16} aria-hidden />
              {t('kubernetes.backToList')}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="ontology-admin">
      <header className="page-header">
        <div>
          <Link to="/console/kubernetes" className="btn btn-secondary btn-sm">
            <ArrowLeft size={16} aria-hidden />
            <span>{t('kubernetes.backToList')}</span>
          </Link>
          <h1>{cluster.name}</h1>
          <p className="page-subtitle">
            {cluster.api_server ?? t('kubernetes.dash')}
            {cluster.description ? ` · ${cluster.description}` : ''}
            {` · ${t('kubernetes.detailHint')}`}
          </p>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setApplyNs(namespace);
              setApplyOpen(true);
            }}
          >
            <FilePlus2 size={18} aria-hidden />
            <span>{t('kubernetes.applyTitle')}</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void loadResources()}
            disabled={loadingResources}
          >
            {loadingResources ? (
              <Loader2 size={18} className="console-loading-spinner" aria-hidden />
            ) : (
              <RefreshCw size={18} aria-hidden />
            )}
            <span>{t('kubernetes.refresh')}</span>
          </button>
        </div>
      </header>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="ontology-admin-content">
        <div className="console-k8s-toolbar">
          <FormField label={t('kubernetes.browseNamespace')} htmlFor="k8s-browse-ns">
            <select
              id="k8s-browse-ns"
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              disabled={loadingResources}
            >
              {namespaces.length === 0 ? (
                <option value={namespace}>{namespace}</option>
              ) : (
                namespaces.map((ns) => (
                  <option key={ns.name} value={ns.name}>
                    {ns.name}
                    {ns.phase ? ` (${ns.phase})` : ''}
                  </option>
                ))
              )}
            </select>
          </FormField>
        </div>

        <section className="console-k8s-section" aria-labelledby="k8s-deployments-heading">
          <h2 id="k8s-deployments-heading" className="console-k8s-section__title">
            {t('kubernetes.deploymentsHeading')}
          </h2>
          <div className="ds-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('kubernetes.colResourceName')}</th>
                  <th>{t('kubernetes.colReady')}</th>
                  <th>{t('kubernetes.colReplicas')}</th>
                  <th>{t('kubernetes.colAvailable')}</th>
                  <th>{t('kubernetes.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingResources ? (
                  <tr>
                    <td colSpan={5} className="console-table-empty">
                      {t('kubernetes.loading')}
                    </td>
                  </tr>
                ) : deployments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="console-table-empty">
                      {t('kubernetes.deploymentsEmpty')}
                    </td>
                  </tr>
                ) : (
                  deployments.map((d) => (
                    <tr key={d.name}>
                      <td>
                        <strong>{d.name}</strong>
                      </td>
                      <td>{d.ready}</td>
                      <td>{d.replicas}</td>
                      <td>{d.available}</td>
                      <TableRowActionCell>
                        <TableRowActions>
                          <TableRowActionButton
                            title={t('kubernetes.deleteTitle')}
                            aria-label={t('kubernetes.deleteTitle')}
                            icon={<Trash2 size={16} aria-hidden />}
                            onClick={() => void handleDelete('Deployment', d.name)}
                            variant="danger"
                          />
                        </TableRowActions>
                      </TableRowActionCell>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="console-k8s-section" aria-labelledby="k8s-services-heading">
          <h2 id="k8s-services-heading" className="console-k8s-section__title">
            {t('kubernetes.servicesHeading')}
          </h2>
          <div className="ds-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('kubernetes.colResourceName')}</th>
                  <th>{t('kubernetes.colServiceType')}</th>
                  <th>{t('kubernetes.colClusterIp')}</th>
                  <th>{t('kubernetes.colPorts')}</th>
                  <th>{t('kubernetes.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingResources ? (
                  <tr>
                    <td colSpan={5} className="console-table-empty">
                      {t('kubernetes.loading')}
                    </td>
                  </tr>
                ) : services.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="console-table-empty">
                      {t('kubernetes.servicesEmpty')}
                    </td>
                  </tr>
                ) : (
                  services.map((s) => (
                    <tr key={s.name}>
                      <td>
                        <strong>{s.name}</strong>
                      </td>
                      <td>{s.type}</td>
                      <td>{s.cluster_ip ?? t('kubernetes.dash')}</td>
                      <td>{s.ports ?? t('kubernetes.dash')}</td>
                      <TableRowActionCell>
                        <TableRowActions>
                          <TableRowActionButton
                            title={t('kubernetes.registerAppTitle')}
                            aria-label={t('kubernetes.registerAppTitle')}
                            icon={<AppWindow size={16} aria-hidden />}
                            onClick={() => openRegister(s)}
                          />
                          <TableRowActionButton
                            title={t('kubernetes.deleteTitle')}
                            aria-label={t('kubernetes.deleteTitle')}
                            icon={<Trash2 size={16} aria-hidden />}
                            onClick={() => void handleDelete('Service', s.name)}
                            variant="danger"
                          />
                        </TableRowActions>
                      </TableRowActionCell>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="console-k8s-section" aria-labelledby="k8s-pods-heading">
          <h2 id="k8s-pods-heading" className="console-k8s-section__title">
            {t('kubernetes.podsHeading')}
          </h2>
          <div className="ds-table-wrap">
            <table className="console-table">
              <thead>
                <tr>
                  <th>{t('kubernetes.colResourceName')}</th>
                  <th>{t('kubernetes.colPhase')}</th>
                  <th>{t('kubernetes.colReady')}</th>
                  <th>{t('kubernetes.colRestarts')}</th>
                  <th>{t('kubernetes.colNode')}</th>
                  <th>{t('kubernetes.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingResources ? (
                  <tr>
                    <td colSpan={6} className="console-table-empty">
                      {t('kubernetes.loading')}
                    </td>
                  </tr>
                ) : pods.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="console-table-empty">
                      {t('kubernetes.podsEmpty')}
                    </td>
                  </tr>
                ) : (
                  pods.map((p) => (
                    <tr key={p.name}>
                      <td>
                        <strong>{p.name}</strong>
                      </td>
                      <td>{p.phase}</td>
                      <td>{p.ready}</td>
                      <td>{p.restarts}</td>
                      <td>{p.node ?? t('kubernetes.dash')}</td>
                      <TableRowActionCell>
                        <TableRowActions>
                          <TableRowActionButton
                            title={t('kubernetes.logsTitle')}
                            aria-label={t('kubernetes.logsTitle')}
                            icon={<FileText size={16} aria-hidden />}
                            onClick={() => openLogs(p.name)}
                          />
                          <TableRowActionButton
                            title={t('kubernetes.deleteTitle')}
                            aria-label={t('kubernetes.deleteTitle')}
                            icon={<Trash2 size={16} aria-hidden />}
                            onClick={() => void handleDelete('Pod', p.name)}
                            variant="danger"
                          />
                        </TableRowActions>
                      </TableRowActionCell>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Dialog
        open={logsOpen}
        onClose={() => setLogsOpen(false)}
        title={logsPod ? t('kubernetes.logsHeading', { pod: logsPod }) : t('kubernetes.logsTitle')}
        closeAriaLabel={t('kubernetes.closeAria')}
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setLogsOpen(false)}>
              {t('kubernetes.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void loadLogs()}
              disabled={logsLoading}
            >
              {logsLoading ? t('kubernetes.loading') : t('kubernetes.refresh')}
            </button>
          </>
        }
      >
        <FormField label={t('kubernetes.logsTail')} htmlFor="k8s-logs-tail">
          <input
            id="k8s-logs-tail"
            type="number"
            min={1}
            max={5000}
            value={logsTail}
            onChange={(e) => setLogsTail(Number(e.target.value) || 200)}
          />
        </FormField>
        <pre className="ds-control--mono console-k8s-logs">{logsLoading ? t('kubernetes.loading') : logsText || t('kubernetes.logsEmpty')}</pre>
      </Dialog>

      <Dialog
        open={applyOpen}
        onClose={() => !applySubmitting && setApplyOpen(false)}
        closeDisabled={applySubmitting}
        title={t('kubernetes.applyTitle')}
        closeAriaLabel={t('kubernetes.closeAria')}
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setApplyOpen(false)}
              disabled={applySubmitting}
            >
              {t('kubernetes.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleApply()}
              disabled={applySubmitting}
            >
              {applySubmitting ? t('kubernetes.saving') : t('kubernetes.applySubmit')}
            </button>
          </>
        }
      >
        <FormField label={t('kubernetes.browseNamespace')} htmlFor="k8s-apply-ns">
          <input
            id="k8s-apply-ns"
            type="text"
            value={applyNs}
            onChange={(e) => setApplyNs(e.target.value)}
            disabled={applySubmitting}
          />
        </FormField>
        <FormField label={t('kubernetes.applyYaml')} htmlFor="k8s-apply-yaml">
          <textarea
            id="k8s-apply-yaml"
            className="ds-control--mono"
            value={applyYaml}
            onChange={(e) => setApplyYaml(e.target.value)}
            rows={14}
            disabled={applySubmitting}
            spellCheck={false}
            placeholder={t('kubernetes.applyYamlPlaceholder')}
          />
        </FormField>
      </Dialog>

      <Dialog
        open={registerOpen}
        onClose={() => !registerSubmitting && setRegisterOpen(false)}
        closeDisabled={registerSubmitting}
        title={t('kubernetes.registerAppTitle')}
        closeAriaLabel={t('kubernetes.closeAria')}
        size="md"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setRegisterOpen(false)}
              disabled={registerSubmitting}
            >
              {t('kubernetes.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleRegister()}
              disabled={registerSubmitting}
            >
              {registerSubmitting ? t('kubernetes.saving') : t('kubernetes.registerAppSubmit')}
            </button>
          </>
        }
      >
        <p className="page-subtitle">{t('kubernetes.registerAppHint')}</p>
        <FormField label={t('kubernetes.fieldName')} htmlFor="k8s-reg-name">
          <input
            id="k8s-reg-name"
            type="text"
            value={registerName}
            onChange={(e) => setRegisterName(e.target.value)}
            disabled={registerSubmitting}
          />
        </FormField>
        <FormField label={t('kubernetes.fieldApiName')} htmlFor="k8s-reg-api">
          <input
            id="k8s-reg-api"
            type="text"
            value={registerApiName}
            onChange={(e) => setRegisterApiName(e.target.value)}
            disabled={registerSubmitting}
            spellCheck={false}
          />
        </FormField>
        <FormField label={t('kubernetes.fieldPort')} htmlFor="k8s-reg-port">
          {registerSvc && (registerSvc.port_numbers?.length ?? 0) > 0 ? (
            <select
              id="k8s-reg-port"
              value={registerPort}
              onChange={(e) => setRegisterPort(Number(e.target.value))}
              disabled={registerSubmitting}
            >
              {registerSvc.port_numbers!.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="k8s-reg-port"
              type="number"
              min={1}
              max={65535}
              value={registerPort}
              onChange={(e) => setRegisterPort(Number(e.target.value) || 80)}
              disabled={registerSubmitting}
            />
          )}
        </FormField>
      </Dialog>
    </div>
  );
}
