import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { createApp } from '../../data/appBuilderApi';
import type { KubernetesServiceItem } from '../../data/kubernetesClustersApi';
import { Dialog, FormField } from '../../styles/design-system';

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

/**
 * Register a cluster Service as a module App — the flow, its state and its dialog, kept
 * out of the cluster detail page (which was over the file-length limit).
 */
export function KubernetesRegisterAppDialog({
  clusterId,
  namespace,
  service,
  onClose,
}: {
  clusterId: string;
  namespace: string;
  /** The service being registered — the parent mounts this per service (`key`). */
  service: KubernetesServiceItem;
  onClose: () => void;
}) {
  const { t } = useTranslation('console');
  const navigate = useNavigate();
  const [name, setName] = useState(service.name);
  const [apiName, setApiName] = useState(suggestApiName(service.name));
  const [port, setPort] = useState(firstPort(service));
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !apiName.trim()) {
      toast.error(t('kubernetes.toastRegisterFields'));
      return;
    }
    setSubmitting(true);
    try {
      const app = await createApp({
        name: name.trim(),
        api_name: apiName.trim(),
        template_id: 'module',
        bindings: {
          k8s: { cluster_id: clusterId, namespace, service: service.name, port },
        },
      });
      toast.success(t('kubernetes.toastRegisteredApp'));
      onClose();
      navigate(`/apps/${app.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('kubernetes.toastRegisterFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onClose={() => !submitting && onClose()}
      closeDisabled={submitting}
      title={t('kubernetes.registerAppTitle')}
      closeAriaLabel={t('kubernetes.closeAria')}
      size="md"
      footer={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            {t('kubernetes.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            {submitting ? t('kubernetes.saving') : t('kubernetes.registerAppSubmit')}
          </button>
        </>
      }
    >
      <p className="page-subtitle">{t('kubernetes.registerAppHint')}</p>
      <FormField label={t('kubernetes.fieldName')} htmlFor="k8s-reg-name">
        <input
          id="k8s-reg-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={submitting}
        />
      </FormField>
      <FormField label={t('kubernetes.fieldApiName')} htmlFor="k8s-reg-api">
        <input
          id="k8s-reg-api"
          type="text"
          value={apiName}
          onChange={(e) => setApiName(e.target.value)}
          disabled={submitting}
          spellCheck={false}
        />
      </FormField>
      <FormField label={t('kubernetes.fieldPort')} htmlFor="k8s-reg-port">
        {(service.port_numbers?.length ?? 0) > 0 ? (
          <select
            id="k8s-reg-port"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
            disabled={submitting}
          >
            {service.port_numbers!.map((p) => (
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
            value={port}
            onChange={(e) => setPort(Number(e.target.value) || 80)}
            disabled={submitting}
          />
        )}
      </FormField>
    </Dialog>
  );
}
