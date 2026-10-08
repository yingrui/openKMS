import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  fetchClusterPodDetail,
  type KubernetesPodDetail,
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
  podName: string | null;
};

function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (!entries.length) return '';
  return entries.map(([k, v]) => `${k}=${v}`).join(', ');
}

export function KubernetesPodDetailDialog({
  open,
  onClose,
  clusterId,
  namespace,
  podName,
}: Props) {
  const { t } = useTranslation('console');
  const [detail, setDetail] = useState<KubernetesPodDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<KubernetesDetailTab>('overview');

  useEffect(() => {
    if (!open) {
      setTab('overview');
      return;
    }
    if (!podName) return;
    setLoading(true);
    setDetail(null);
    void fetchClusterPodDetail(clusterId, podName, namespace)
      .then(setDetail)
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : t('kubernetes.toastOperationFailed'));
        setDetail(null);
      })
      .finally(() => setLoading(false));
  }, [open, podName, clusterId, namespace, t]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        podName ? t('kubernetes.podDetailTitle', { name: podName }) : t('kubernetes.viewTitle')
      }
      size="lg"
      footer={
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          {t('kubernetes.cancel')}
        </button>
      }
    >
      <KubernetesDetailTabs tab={tab} onTabChange={setTab} />

      {tab === 'yaml' ? (
        <KubernetesResourceYamlPanel
          active
          clusterId={clusterId}
          namespace={namespace}
          kind="Pod"
          name={podName}
        />
      ) : loading ? (
        <p>{t('kubernetes.loading')}</p>
      ) : !detail ? (
        <p className="page-subtitle">{t('kubernetes.dash')}</p>
      ) : (
        <>
          <dl className="console-k8s-detail-dl">
            <div>
              <dt>{t('kubernetes.colResourceName')}</dt>
              <dd>{detail.name}</dd>
            </div>
            <div>
              <dt>{t('kubernetes.browseNamespace')}</dt>
              <dd>{detail.namespace}</dd>
            </div>
            <div>
              <dt>{t('kubernetes.colPhase')}</dt>
              <dd>{detail.phase}</dd>
            </div>
            <div>
              <dt>{t('kubernetes.colReady')}</dt>
              <dd>{detail.ready}</dd>
            </div>
            <div>
              <dt>{t('kubernetes.colRestarts')}</dt>
              <dd>{detail.restarts}</dd>
            </div>
            <div>
              <dt>{t('kubernetes.colNode')}</dt>
              <dd>{detail.node ?? t('kubernetes.dash')}</dd>
            </div>
            <div>
              <dt>{t('kubernetes.colPodIp')}</dt>
              <dd>{detail.pod_ip ?? t('kubernetes.dash')}</dd>
            </div>
            <div>
              <dt>{t('kubernetes.colLabels')}</dt>
              <dd className="ds-control--mono">
                {formatLabels(detail.labels) || t('kubernetes.dash')}
              </dd>
            </div>
          </dl>
          <h3 className="console-k8s-env-subtitle">{t('kubernetes.containersHeading')}</h3>
          {detail.containers.length === 0 ? (
            <p className="page-subtitle">{t('kubernetes.deploymentNoContainers')}</p>
          ) : (
            detail.containers.map((c) => (
              <section key={c.name} className="console-k8s-detail-container">
                <h4 className="console-k8s-detail-subhead">{c.name}</h4>
                <dl className="console-k8s-detail-dl">
                  <div>
                    <dt>{t('kubernetes.colImage')}</dt>
                    <dd className="ds-control--mono">{c.image || t('kubernetes.dash')}</dd>
                  </div>
                  <div>
                    <dt>{t('kubernetes.colReady')}</dt>
                    <dd>{c.ready ? t('kubernetes.testOk') : t('kubernetes.testFailed')}</dd>
                  </div>
                  <div>
                    <dt>{t('kubernetes.colRestarts')}</dt>
                    <dd>{c.restarts}</dd>
                  </div>
                  <div>
                    <dt>{t('kubernetes.colState')}</dt>
                    <dd className="ds-control--mono">{c.state}</dd>
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
              </section>
            ))
          )}
        </>
      )}
    </Dialog>
  );
}
