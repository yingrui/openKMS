import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  fetchDeploymentEnv,
  type KubernetesContainerEnv,
  type KubernetesDeploymentItem,
  type KubernetesEnvFrom,
  type KubernetesEnvVar,
} from '../../data/kubernetesClustersApi';
import { Dialog } from '../../styles/design-system';
import {
  KubernetesDetailTabs,
  KubernetesResourceYamlPanel,
  type KubernetesDetailTab,
} from './KubernetesResourceYamlPanel';

type Props = {
  open: boolean;
  onClose: () => void;
  clusterId: string;
  namespace: string;
  deployment: KubernetesDeploymentItem | null;
};

function formatEnvVar(e: KubernetesEnvVar, t: (k: string) => string): string {
  if (e.value_from?.secret_key_ref) {
    const r = e.value_from.secret_key_ref;
    return `${e.name} ← ${t('kubernetes.envKindSecret')}:${r.name}/${r.key}`;
  }
  if (e.value_from?.config_map_key_ref) {
    const r = e.value_from.config_map_key_ref;
    return `${e.name} ← ${t('kubernetes.envKindConfigMap')}:${r.name}/${r.key}`;
  }
  return `${e.name}=${e.value ?? ''}`;
}

function formatEnvFrom(e: KubernetesEnvFrom, t: (k: string) => string): string {
  if (e.secret_ref) {
    const p = e.prefix ? ` prefix=${e.prefix}` : '';
    return `${t('kubernetes.envKindSecret')}:${e.secret_ref.name}${p}`;
  }
  if (e.config_map_ref) {
    const p = e.prefix ? ` prefix=${e.prefix}` : '';
    return `${t('kubernetes.envKindConfigMap')}:${e.config_map_ref.name}${p}`;
  }
  return t('kubernetes.dash');
}

export function KubernetesDeploymentDetailDialog({
  open,
  onClose,
  clusterId,
  namespace,
  deployment,
}: Props) {
  const { t } = useTranslation('console');
  const [containers, setContainers] = useState<KubernetesContainerEnv[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<KubernetesDetailTab>('overview');

  useEffect(() => {
    if (!open) {
      setTab('overview');
      return;
    }
    if (!deployment) return;
    setLoading(true);
    void fetchDeploymentEnv(clusterId, deployment.name, namespace)
      .then((res) => setContainers(res.containers))
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : t('kubernetes.toastOperationFailed'));
        setContainers([]);
      })
      .finally(() => setLoading(false));
  }, [open, deployment, clusterId, namespace, t]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        deployment
          ? t('kubernetes.deploymentDetailTitle', { name: deployment.name })
          : t('kubernetes.viewTitle')
      }
      size="lg"
      footer={
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          {t('kubernetes.cancel')}
        </button>
      }
    >
      <KubernetesDetailTabs tab={tab} onTabChange={setTab} />

      {tab === 'overview' ? (
        <>
          {deployment ? (
            <dl className="console-k8s-detail-dl">
              <div>
                <dt>{t('kubernetes.colResourceName')}</dt>
                <dd>{deployment.name}</dd>
              </div>
              <div>
                <dt>{t('kubernetes.colReady')}</dt>
                <dd>{deployment.ready}</dd>
              </div>
              <div>
                <dt>{t('kubernetes.colReplicas')}</dt>
                <dd>{deployment.replicas}</dd>
              </div>
              <div>
                <dt>{t('kubernetes.colAvailable')}</dt>
                <dd>{deployment.available}</dd>
              </div>
              <div>
                <dt>{t('kubernetes.browseNamespace')}</dt>
                <dd>{namespace}</dd>
              </div>
            </dl>
          ) : null}

          {loading ? (
            <p>{t('kubernetes.loading')}</p>
          ) : containers.length === 0 ? (
            <p className="page-subtitle">{t('kubernetes.deploymentNoContainers')}</p>
          ) : (
            containers.map((c) => (
              <section key={c.name} className="console-k8s-detail-container">
                <h3 className="console-k8s-env-subtitle">{c.name}</h3>
                <dl className="console-k8s-detail-dl">
                  <div>
                    <dt>{t('kubernetes.colImage')}</dt>
                    <dd className="ds-control--mono">{c.image || t('kubernetes.dash')}</dd>
                  </div>
                  <div>
                    <dt>{t('kubernetes.colPorts')}</dt>
                    <dd>
                      {(c.ports || []).length
                        ? (c.ports || [])
                            .map(
                              (p) =>
                                `${p.name ? `${p.name}:` : ''}${p.container_port}/${p.protocol}`
                            )
                            .join(', ')
                        : t('kubernetes.dash')}
                    </dd>
                  </div>
                </dl>
                <h4 className="console-k8s-detail-subhead">{t('kubernetes.envVarsHeading')}</h4>
                {c.env.length === 0 ? (
                  <p className="page-subtitle">{t('kubernetes.dash')}</p>
                ) : (
                  <ul className="console-k8s-detail-list">
                    {c.env.map((e) => (
                      <li key={e.name} className="ds-control--mono">
                        {formatEnvVar(e, t)}
                      </li>
                    ))}
                  </ul>
                )}
                <h4 className="console-k8s-detail-subhead">{t('kubernetes.envFromHeading')}</h4>
                {c.env_from.length === 0 ? (
                  <p className="page-subtitle">{t('kubernetes.dash')}</p>
                ) : (
                  <ul className="console-k8s-detail-list">
                    {c.env_from.map((e, i) => (
                      <li key={i} className="ds-control--mono">
                        {formatEnvFrom(e, t)}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))
          )}
        </>
      ) : (
        <KubernetesResourceYamlPanel
          active={tab === 'yaml'}
          clusterId={clusterId}
          namespace={namespace}
          kind="Deployment"
          name={deployment?.name ?? null}
        />
      )}
    </Dialog>
  );
}
