import { useEffect, useState } from 'react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  fetchClusterServiceDetail,
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
  serviceName: string | null;
};

function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (!entries.length) return '';
  return entries.map(([k, v]) => `${k}=${v}`).join(', ');
}

export function KubernetesServiceDetailDialog({
  open,
  onClose,
  clusterId,
  namespace,
  serviceName,
}: Props) {
  const { t } = useTranslation('console');
  const {
    data: detail,
    loading,
    error: loadError,
  } = useAsyncData(
    () =>
      open && serviceName
        ? fetchClusterServiceDetail(clusterId, serviceName, namespace)
        : Promise.resolve(null),
    [open, serviceName, clusterId, namespace],
  );
  const [tab, setTab] = useState<KubernetesDetailTab>('overview');

  useEffect(() => {
    if (loadError) {
      toast.error(
        loadError instanceof Error ? loadError.message : t('kubernetes.toastOperationFailed'),
      );
    }
  }, [loadError, t]);

  // The tab resets when the dialog closes or its subject changes (render-time adjustment).
  const tabKey = `${open}:${serviceName ?? ''}`;
  const [lastTabKey, setLastTabKey] = useState(tabKey);
  if (tabKey !== lastTabKey) {
    setLastTabKey(tabKey);
    setTab('overview');
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        serviceName
          ? t('kubernetes.serviceDetailTitle', { name: serviceName })
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

      {tab === 'yaml' ? (
        <KubernetesResourceYamlPanel
          active
          clusterId={clusterId}
          namespace={namespace}
          kind="Service"
          name={serviceName}
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
              <dt>{t('kubernetes.colServiceType')}</dt>
              <dd>{detail.type}</dd>
            </div>
            <div>
              <dt>{t('kubernetes.colClusterIp')}</dt>
              <dd>{detail.cluster_ip ?? t('kubernetes.dash')}</dd>
            </div>
            <div>
              <dt>{t('kubernetes.colExternalIps')}</dt>
              <dd>
                {detail.external_ips.length
                  ? detail.external_ips.join(', ')
                  : t('kubernetes.dash')}
              </dd>
            </div>
            <div>
              <dt>{t('kubernetes.colSelector')}</dt>
              <dd className="ds-control--mono">
                {formatLabels(detail.selector) || t('kubernetes.dash')}
              </dd>
            </div>
            <div>
              <dt>{t('kubernetes.colLabels')}</dt>
              <dd className="ds-control--mono">
                {formatLabels(detail.labels) || t('kubernetes.dash')}
              </dd>
            </div>
          </dl>
          <h3 className="console-k8s-env-subtitle">{t('kubernetes.colPorts')}</h3>
          {detail.ports.length === 0 ? (
            <p className="page-subtitle">{t('kubernetes.dash')}</p>
          ) : (
            <ul className="console-k8s-detail-list">
              {detail.ports.map((p, i) => (
                <li key={i} className="ds-control--mono">
                  {[
                    p.name ? `${p.name}:` : '',
                    `${p.port}`,
                    p.target_port != null ? `→${p.target_port}` : '',
                    p.node_port != null ? ` node=${p.node_port}` : '',
                    `/${p.protocol}`,
                  ].join('')}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Dialog>
  );
}
