import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Dialog, FormField } from '../../styles/design-system';
import {
  createExternalService,
  fetchClusterOptions,
  updateExternalService,
  type ExternalServiceResponse,
  type K8sClusterOption,
} from '../../data/externalServicesApi';

type Draft = {
  api_name: string;
  display_name: string;
  description: string;
  kind: ExternalServiceResponse['kind'];
  base_url: string;
  cluster_id: string;
  namespace: string;
  service: string;
  port: string;
  base_path: string;
  auth_kind: ExternalServiceResponse['auth_kind'];
  auth_header_name: string;
  secret: string;
  allowed_paths: string;
  timeout_seconds: string;
};

const EMPTY: Draft = {
  api_name: '',
  display_name: '',
  description: '',
  kind: 'http',
  base_url: '',
  cluster_id: '',
  namespace: '',
  service: '',
  port: '',
  base_path: '',
  auth_kind: 'none',
  auth_header_name: '',
  secret: '',
  allowed_paths: '/api/',
  timeout_seconds: '10',
};

function toDraft(service: ExternalServiceResponse): Draft {
  return {
    api_name: service.api_name,
    display_name: service.display_name,
    description: service.description || '',
    kind: service.kind,
    base_url: service.base_url || '',
    cluster_id: service.cluster_id || '',
    namespace: service.namespace || '',
    service: service.service || '',
    port: service.port ? String(service.port) : '',
    base_path: service.base_path || '',
    auth_kind: service.auth_kind,
    auth_header_name: service.auth_header_name || '',
    // Never prefilled: the stored secret is not returned. Empty = keep it.
    secret: '',
    allowed_paths: service.allowed_paths.join('\n'),
    timeout_seconds: String(service.timeout_seconds),
  };
}

function pathsFrom(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Create or edit one external service.
 *
 * The kind decides where the service lives, and that decides who sends the request: a URL is called
 * by the function sandbox; a cluster Service is called by openKMS through that cluster's kubeconfig,
 * because the sandbox cannot resolve cluster DNS.
 */
export function ExternalServiceFormDialog({
  open,
  service,
  onClose,
  onSaved,
}: {
  open: boolean;
  service: ExternalServiceResponse | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { t } = useTranslation('ontology');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [clusters, setClusters] = useState<K8sClusterOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(service ? toDraft(service) : EMPTY);
    fetchClusterOptions()
      .then(setClusters)
      .catch(() => setClusters([]));
  }, [open, service]);

  const targetReady =
    draft.kind === 'http'
      ? draft.base_url.trim().length > 0
      : draft.cluster_id.trim().length > 0 &&
        draft.namespace.trim().length > 0 &&
        draft.service.trim().length > 0 &&
        Number(draft.port) > 0;
  const canSave =
    draft.display_name.trim().length > 0 &&
    targetReady &&
    pathsFrom(draft.allowed_paths).length > 0 &&
    (service !== null || /^[a-zA-Z][a-zA-Z0-9_]*$/.test(draft.api_name.trim())) &&
    (service?.has_secret || draft.auth_kind === 'none' || draft.secret.trim().length > 0);

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    const target =
      draft.kind === 'http'
        ? { base_url: draft.base_url.trim() }
        : {
            cluster_id: draft.cluster_id,
            namespace: draft.namespace.trim(),
            service: draft.service.trim(),
            port: Number(draft.port),
          };
    const auth = {
      auth_kind: draft.auth_kind,
      auth_header_name:
        draft.auth_kind === 'header' || draft.auth_kind === 'hmac'
          ? draft.auth_header_name.trim() || undefined
          : undefined,
      // Empty means "leave the stored secret alone" — a form that cannot show it must not clear it.
      secret: draft.secret.trim() ? draft.secret.trim() : undefined,
    };
    try {
      if (service) {
        await updateExternalService(service.id, {
          display_name: draft.display_name.trim(),
          description: draft.description.trim(),
          kind: draft.kind,
          ...target,
          base_path: draft.base_path.trim(),
          ...auth,
          allowed_paths: pathsFrom(draft.allowed_paths),
          timeout_seconds: Number(draft.timeout_seconds) || 10,
        });
        toast.success(t('editor.external.saved'));
      } else {
        await createExternalService({
          api_name: draft.api_name.trim(),
          display_name: draft.display_name.trim(),
          description: draft.description.trim() || undefined,
          kind: draft.kind,
          ...target,
          base_path: draft.base_path.trim(),
          ...auth,
          allowed_paths: pathsFrom(draft.allowed_paths),
          timeout_seconds: Number(draft.timeout_seconds) || 10,
        });
        toast.success(t('editor.external.created'));
      }
      await onSaved();
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('editor.external.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={service ? t('editor.external.editTitle') : t('editor.external.add')}
      size="lg"
      className="external-services-dialog"
      closeDisabled={saving}
      closeAriaLabel={t('shared.close')}
      footer={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            {t('shared.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void onSave()}
            disabled={!canSave || saving}
          >
            {saving ? t('shared.saving') : t('shared.save')}
          </button>
        </>
      }
    >
      <div className="external-services__form">
        <FormField label={t('editor.external.apiName')}>
          <input
            className="console-form-control"
            value={draft.api_name}
            onChange={(e) => setDraft({ ...draft, api_name: e.target.value })}
            placeholder="turtle"
            disabled={!!service}
          />
        </FormField>
        <FormField label={t('editor.external.displayName')}>
          <input
            className="console-form-control"
            value={draft.display_name}
            onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
          />
        </FormField>
        <FormField label={t('editor.external.kind')} hint={t('editor.external.kindHint')}>
          <select
            className="console-form-control"
            value={draft.kind}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft['kind'] })}
          >
            <option value="http">{t('editor.external.kindHttp')}</option>
            <option value="k8s_service">{t('editor.external.kindK8s')}</option>
          </select>
        </FormField>
        {draft.kind === 'http' ? (
          <FormField label={t('editor.external.baseUrl')}>
            <input
              className="console-form-control"
              value={draft.base_url}
              onChange={(e) => setDraft({ ...draft, base_url: e.target.value })}
              placeholder="http://backend:8200"
            />
          </FormField>
        ) : (
          <>
            <FormField label={t('editor.external.cluster')}>
              <select
                className="console-form-control"
                value={draft.cluster_id}
                onChange={(e) => {
                  const cluster = clusters.find((c) => c.id === e.target.value);
                  setDraft({
                    ...draft,
                    cluster_id: e.target.value,
                    namespace: draft.namespace || cluster?.default_namespace || '',
                  });
                }}
              >
                <option value="">{t('editor.external.clusterNone')}</option>
                {clusters.map((cluster) => (
                  <option key={cluster.id} value={cluster.id}>
                    {cluster.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label={t('editor.external.namespace')}>
              <input
                className="console-form-control"
                value={draft.namespace}
                onChange={(e) => setDraft({ ...draft, namespace: e.target.value })}
                placeholder="stock"
              />
            </FormField>
            <FormField label={t('editor.external.serviceName')}>
              <input
                className="console-form-control"
                value={draft.service}
                onChange={(e) => setDraft({ ...draft, service: e.target.value })}
                placeholder="backend"
              />
            </FormField>
            <FormField label={t('editor.external.port')}>
              <input
                className="console-form-control"
                type="number"
                min={1}
                max={65535}
                value={draft.port}
                onChange={(e) => setDraft({ ...draft, port: e.target.value })}
                placeholder="8200"
              />
            </FormField>
          </>
        )}
        <FormField label={t('editor.external.basePath')} hint={t('editor.external.basePathHint')}>
          <input
            className="console-form-control"
            value={draft.base_path}
            onChange={(e) => setDraft({ ...draft, base_path: e.target.value })}
            placeholder="/"
          />
        </FormField>
        <FormField label={t('editor.external.auth')}>
          <select
            className="console-form-control"
            value={draft.auth_kind}
            onChange={(e) =>
              setDraft({ ...draft, auth_kind: e.target.value as Draft['auth_kind'] })
            }
          >
            <option value="none">{t('editor.external.authNone')}</option>
            <option value="bearer">{t('editor.external.authBearer')}</option>
            <option value="header">{t('editor.external.authHeader')}</option>
            <option value="hmac">{t('editor.external.authHmac')}</option>
          </select>
        </FormField>
        {draft.auth_kind === 'header' || draft.auth_kind === 'hmac' ? (
          <FormField label={t('editor.external.authHeaderName')}>
            <input
              className="console-form-control"
              value={draft.auth_header_name}
              onChange={(e) => setDraft({ ...draft, auth_header_name: e.target.value })}
              placeholder={draft.auth_kind === 'hmac' ? 'X-OpenKMS-Signature' : 'X-API-Key'}
            />
          </FormField>
        ) : null}
        {draft.auth_kind !== 'none' ? (
          <FormField
            label={t('editor.external.secret')}
            hint={service?.has_secret ? t('editor.external.secretKeepHint') : undefined}
          >
            <input
              className="console-form-control"
              type="password"
              value={draft.secret}
              onChange={(e) => setDraft({ ...draft, secret: e.target.value })}
              autoComplete="new-password"
            />
          </FormField>
        ) : null}
        <FormField
          label={t('editor.external.allowedPaths')}
          hint={t('editor.external.allowedPathsHint')}
        >
          <textarea
            className="console-form-control"
            rows={3}
            value={draft.allowed_paths}
            onChange={(e) => setDraft({ ...draft, allowed_paths: e.target.value })}
          />
        </FormField>
        <FormField label={t('editor.external.timeout')}>
          <input
            className="console-form-control"
            type="number"
            min={1}
            max={60}
            value={draft.timeout_seconds}
            onChange={(e) => setDraft({ ...draft, timeout_seconds: e.target.value })}
          />
        </FormField>
        <FormField label={t('editor.external.description')}>
          <input
            className="console-form-control"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </FormField>
      </div>
    </Dialog>
  );
}
