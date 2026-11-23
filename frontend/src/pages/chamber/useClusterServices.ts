import { useAsyncData } from '../../hooks/useAsyncData';
import {
  fetchClusterNamespaces,
  fetchClusterServices,
  fetchKubernetesClusters,
  type KubernetesClusterResponse,
  type KubernetesServiceItem,
} from '../../data/kubernetesClustersApi';

export type ClusterServices = {
  clusters: KubernetesClusterResponse[];
  /** `null` until a cluster is chosen — an empty array means the cluster answered with nothing. */
  namespaces: string[] | null;
  /** `null` until a namespace is chosen — an empty array means the namespace answered with nothing. */
  services: KubernetesServiceItem[] | null;
  loading: boolean;
  /** The first failure in the chain, as thrown. Callers show it; nothing here invents a message. */
  error: unknown;
  /** Per-step failures, for screens that react differently (the binding editor falls back to a text input). */
  clustersError: unknown;
  namespacesError: unknown;
  servicesError: unknown;
  reload: () => void;
};

/**
 * The three lookups every Chamber screen that points at a Service needs: cluster → namespace → Service.
 *
 * They were written three times (register wizard, binding editor, and the cluster page's dialog gets them from its
 * parent), each with its own idea of what a failure means. Keeping them together is what makes "an unreachable
 * cluster is an error, not an empty Service list" one decision instead of three.
 */
export function useClusterServices({
  clusterId,
  namespace,
  enabled = true,
}: {
  clusterId: string;
  namespace: string;
  /** A read-only visitor should not make these calls at all. */
  enabled?: boolean;
}): ClusterServices {
  const clusters = useAsyncData(
    async () => (enabled ? (await fetchKubernetesClusters({ limit: 200 })).items || [] : []),
    [enabled],
  );
  const namespaces = useAsyncData(
    async () =>
      enabled && clusterId ? (await fetchClusterNamespaces(clusterId)).items.map((n) => n.name) : null,
    [enabled, clusterId],
  );
  const services = useAsyncData(
    async () =>
      enabled && clusterId && namespace
        ? (await fetchClusterServices(clusterId, namespace)).items || []
        : null,
    [enabled, clusterId, namespace],
  );

  return {
    clusters: clusters.data ?? [],
    namespaces: namespaces.data,
    services: services.data,
    loading: clusters.loading || namespaces.loading || services.loading,
    error: namespaces.error ?? services.error ?? clusters.error,
    clustersError: clusters.error,
    namespacesError: namespaces.error,
    servicesError: services.error,
    reload: () => {
      clusters.reload();
      namespaces.reload();
      services.reload();
    },
  };
}
