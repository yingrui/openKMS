import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { ErrorBanner } from '../../components/ErrorBanner';
import {
  fetchClusterDeployments,
  fetchClusterNamespaces,
  fetchClusterPods,
  fetchKubernetesCluster,
  type KubernetesClusterResponse,
  type KubernetesDeploymentItem,
  type KubernetesNamespaceItem,
  type KubernetesPodItem,
} from '../../data/kubernetesClustersApi';
import { EmptyState, FormField } from '../../styles/design-system';
import '../ontology/ontology-admin.scss';

export function ConsoleKubernetesDetail() {
  const { t } = useTranslation('console');
  const { clusterId = '' } = useParams<{ clusterId: string }>();
  const [cluster, setCluster] = useState<KubernetesClusterResponse | null>(null);
  const [namespaces, setNamespaces] = useState<KubernetesNamespaceItem[]>([]);
  const [namespace, setNamespace] = useState('');
  const [deployments, setDeployments] = useState<KubernetesDeploymentItem[]>([]);
  const [pods, setPods] = useState<KubernetesPodItem[]>([]);
  const [loadingCluster, setLoadingCluster] = useState(true);
  const [loadingResources, setLoadingResources] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const [depRes, podRes] = await Promise.all([
        fetchClusterDeployments(clusterId, namespace),
        fetchClusterPods(clusterId, namespace),
      ]);
      setDeployments(depRes.items);
      setPods(podRes.items);
    } catch (e) {
      setDeployments([]);
      setPods([]);
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
          </p>
        </div>
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
                </tr>
              </thead>
              <tbody>
                {loadingResources ? (
                  <tr>
                    <td colSpan={4} className="console-table-empty">
                      {t('kubernetes.loading')}
                    </td>
                  </tr>
                ) : deployments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="console-table-empty">
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
                </tr>
              </thead>
              <tbody>
                {loadingResources ? (
                  <tr>
                    <td colSpan={5} className="console-table-empty">
                      {t('kubernetes.loading')}
                    </td>
                  </tr>
                ) : pods.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="console-table-empty">
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
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
