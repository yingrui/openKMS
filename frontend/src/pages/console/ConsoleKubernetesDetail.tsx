import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, FilePlus2, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBanner } from '../../components/ErrorBanner';
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
import { Dialog, EmptyState, FormField, TableRowActionCell } from '../../styles/design-system';
import { KubernetesSecretsSection } from './KubernetesSecretsSection';
import { KubernetesRegisterAppDialog } from './KubernetesRegisterAppDialog';
import { DeploymentRowActions } from './KubernetesDeploymentRowActions';
import { ServiceRowActions } from './KubernetesServiceRowActions';
import { PodRowActions } from './KubernetesPodRowActions';
import { KubernetesDeploymentEnvDialog } from './KubernetesDeploymentEnvDialog';
import { KubernetesDeploymentDetailDialog } from './KubernetesDeploymentDetailDialog';
import { KubernetesServiceDetailDialog } from './KubernetesServiceDetailDialog';
import { KubernetesPodDetailDialog } from './KubernetesPodDetailDialog';
import '../ontology/ontology-admin.scss';

export function ConsoleKubernetesDetail() {
  const { t } = useTranslation('console');
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

  const [registerSvc, setRegisterSvc] = useState<KubernetesServiceItem | null>(null);

  const [envOpen, setEnvOpen] = useState(false);
  const [envDeployment, setEnvDeployment] = useState<string | null>(null);
  const [detailDeployment, setDetailDeployment] = useState<KubernetesDeploymentItem | null>(null);
  const [detailService, setDetailService] = useState<string | null>(null);
  const [detailPod, setDetailPod] = useState<string | null>(null);

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
                        <button
                          type="button"
                          className="console-k8s-name-link"
                          onClick={() => setDetailDeployment(d)}
                        >
                          <strong>{d.name}</strong>
                        </button>
                      </td>
                      <td>{d.ready}</td>
                      <td>{d.replicas}</td>
                      <td>{d.available}</td>
                      <TableRowActionCell>
                        <DeploymentRowActions
                          onView={() => setDetailDeployment(d)}
                          onEnv={() => {
                            setEnvDeployment(d.name);
                            setEnvOpen(true);
                          }}
                          onDelete={() => void handleDelete('Deployment', d.name)}
                        />
                      </TableRowActionCell>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <KubernetesSecretsSection
          clusterId={clusterId}
          namespace={namespace}
          loadingResources={loadingResources}
        />

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
                        <button
                          type="button"
                          className="console-k8s-name-link"
                          onClick={() => setDetailService(s.name)}
                        >
                          <strong>{s.name}</strong>
                        </button>
                      </td>
                      <td>{s.type}</td>
                      <td>{s.cluster_ip ?? t('kubernetes.dash')}</td>
                      <td>{s.ports ?? t('kubernetes.dash')}</td>
                      <TableRowActionCell>
                        <ServiceRowActions
                          onView={() => setDetailService(s.name)}
                          onRegisterApp={() => setRegisterSvc(s)}
                          onDelete={() => void handleDelete('Service', s.name)}
                        />
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
                        <button
                          type="button"
                          className="console-k8s-name-link"
                          onClick={() => setDetailPod(p.name)}
                        >
                          <strong>{p.name}</strong>
                        </button>
                      </td>
                      <td>{p.phase}</td>
                      <td>{p.ready}</td>
                      <td>{p.restarts}</td>
                      <td>{p.node ?? t('kubernetes.dash')}</td>
                      <TableRowActionCell>
                        <PodRowActions
                          onView={() => setDetailPod(p.name)}
                          onLogs={() => openLogs(p.name)}
                          onDelete={() => void handleDelete('Pod', p.name)}
                        />
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

      {registerSvc && (
        <KubernetesRegisterAppDialog
          key={registerSvc.name}
          clusterId={clusterId}
          namespace={namespace}
          service={registerSvc}
          onClose={() => setRegisterSvc(null)}
        />
      )}

      <KubernetesDeploymentDetailDialog
        open={!!detailDeployment}
        onClose={() => setDetailDeployment(null)}
        clusterId={clusterId}
        namespace={namespace}
        deployment={detailDeployment}
      />

      <KubernetesServiceDetailDialog
        open={!!detailService}
        onClose={() => setDetailService(null)}
        clusterId={clusterId}
        namespace={namespace}
        serviceName={detailService}
      />

      <KubernetesPodDetailDialog
        open={!!detailPod}
        onClose={() => setDetailPod(null)}
        clusterId={clusterId}
        namespace={namespace}
        podName={detailPod}
      />

      <KubernetesDeploymentEnvDialog
        open={envOpen}
        onClose={() => {
          setEnvOpen(false);
          setEnvDeployment(null);
        }}
        clusterId={clusterId}
        namespace={namespace}
        deployment={envDeployment}
      />
    </div>
  );
}
