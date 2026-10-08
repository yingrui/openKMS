import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  fetchClusterManifestYaml,
  type KubernetesManifestKind,
} from '../../data/kubernetesClustersApi';

type Props = {
  active: boolean;
  clusterId: string;
  namespace: string;
  kind: KubernetesManifestKind;
  name: string | null;
};

export function KubernetesResourceYamlPanel({
  active,
  clusterId,
  namespace,
  kind,
  name,
}: Props) {
  const { t } = useTranslation('console');
  const [yaml, setYaml] = useState('');
  const [redacted, setRedacted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active || !name) return;
    setLoading(true);
    setYaml('');
    void fetchClusterManifestYaml(clusterId, kind, name, namespace)
      .then((res) => {
        setYaml(res.yaml);
        setRedacted(res.redacted);
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : t('kubernetes.toastOperationFailed'));
        setYaml('');
        setRedacted(false);
      })
      .finally(() => setLoading(false));
  }, [active, clusterId, kind, name, namespace, t]);

  if (!active) return null;

  return (
    <div className="console-k8s-yaml">
      {redacted ? <p className="page-subtitle">{t('kubernetes.yamlRedactedHint')}</p> : null}
      {loading ? (
        <p>{t('kubernetes.loading')}</p>
      ) : (
        <pre className="ds-control--mono console-k8s-yaml__pre">{yaml || t('kubernetes.dash')}</pre>
      )}
    </div>
  );
}

type Tab = 'overview' | 'yaml';

type TabsProps = {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
};

export function KubernetesDetailTabs({ tab, onTabChange }: TabsProps) {
  const { t } = useTranslation('console');
  return (
    <div className="console-k8s-detail-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'overview'}
        className={
          tab === 'overview'
            ? 'console-k8s-detail-tabs__btn is-active'
            : 'console-k8s-detail-tabs__btn'
        }
        onClick={() => onTabChange('overview')}
      >
        {t('kubernetes.detailTabOverview')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'yaml'}
        className={
          tab === 'yaml'
            ? 'console-k8s-detail-tabs__btn is-active'
            : 'console-k8s-detail-tabs__btn'
        }
        onClick={() => onTabChange('yaml')}
      >
        {t('kubernetes.detailTabYaml')}
      </button>
    </div>
  );
}

export type { Tab as KubernetesDetailTab };
