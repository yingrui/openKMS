import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, FormField } from '../../styles/design-system';
import {
  createExternalService,
  deleteExternalService,
  fetchExternalServices,
  updateExternalService,
  type ExternalServiceResponse,
} from '../../data/externalServicesApi';
import './external-services.scss';

type Draft = {
  api_name: string;
  display_name: string;
  description: string;
  base_url: string;
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
  base_url: '',
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
    base_url: service.base_url,
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
 * Register the external HTTP services this deployment's Functions may call.
 *
 * It lives in the Function Editor, next to the code that names them (`client.external("turtle")`),
 * because the author is the one who knows the endpoint. The secret is write-only here: it is stored
 * encrypted and only the function runtime can resolve it.
 */
export function ExternalServicesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('ontology');
  const [services, setServices] = useState<ExternalServiceResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<ExternalServiceResponse | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setServices(await fetchExternalServices());
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('editor.external.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!open) return;
    setShowForm(false);
    setEditing(null);
    void load();
  }, [open, load]);

  const openCreate = () => {
    setEditing(null);
    setDraft(EMPTY);
    setShowForm(true);
  };

  const openEdit = (service: ExternalServiceResponse) => {
    setEditing(service);
    setDraft(toDraft(service));
    setShowForm(true);
  };

  const canSave =
    draft.display_name.trim() &&
    draft.base_url.trim() &&
    pathsFrom(draft.allowed_paths).length > 0 &&
    (editing || /^[a-zA-Z][a-zA-Z0-9_]*$/.test(draft.api_name.trim())) &&
    (editing?.has_secret || draft.auth_kind === 'none' || draft.secret.trim() || editing);

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    const paths = pathsFrom(draft.allowed_paths);
    try {
      if (editing) {
        await updateExternalService(editing.id, {
          display_name: draft.display_name.trim(),
          description: draft.description.trim(),
          base_url: draft.base_url.trim(),
          auth_kind: draft.auth_kind,
          auth_header_name:
            draft.auth_kind === 'header' || draft.auth_kind === 'hmac'
              ? draft.auth_header_name.trim() || undefined
              : undefined,
          // Empty means "leave the stored secret alone" — a form that cannot show it must not clear it.
          secret: draft.secret.trim() ? draft.secret.trim() : undefined,
          allowed_paths: paths,
          timeout_seconds: Number(draft.timeout_seconds) || 10,
        });
        toast.success(t('editor.external.saved'));
      } else {
        await createExternalService({
          api_name: draft.api_name.trim(),
          display_name: draft.display_name.trim(),
          description: draft.description.trim() || undefined,
          base_url: draft.base_url.trim(),
          auth_kind: draft.auth_kind,
          auth_header_name:
            draft.auth_kind === 'header' || draft.auth_kind === 'hmac'
              ? draft.auth_header_name.trim() || undefined
              : undefined,
          secret: draft.secret.trim() || undefined,
          allowed_paths: paths,
          timeout_seconds: Number(draft.timeout_seconds) || 10,
        });
        toast.success(t('editor.external.created'));
      }
      setShowForm(false);
      setEditing(null);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('editor.external.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (service: ExternalServiceResponse) => {
    try {
      await deleteExternalService(service.id);
      toast.success(t('editor.external.deleted'));
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('editor.external.deleteFailed'));
    }
  };

  const footer = showForm ? (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)} disabled={saving}>
        {t('shared.cancel')}
      </button>
      <button type="button" className="btn btn-primary" onClick={() => void onSave()} disabled={!canSave || saving}>
        {saving ? t('shared.saving') : t('shared.save')}
      </button>
    </>
  ) : (
    <>
      <button type="button" className="btn btn-secondary" onClick={onClose}>
        {t('shared.close')}
      </button>
      <button type="button" className="btn btn-primary" onClick={openCreate}>
        <Plus size={16} aria-hidden />
        {t('editor.external.add')}
      </button>
    </>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('editor.external.title')}
      size="lg"
      className="external-services-dialog"
      footer={footer}
      closeDisabled={saving}
      closeAriaLabel={t('shared.close')}
    >
      <p className="external-services__hint">{t('editor.external.hint')}</p>

      {showForm ? (
        <div className="external-services__form">
          <FormField label={t('editor.external.apiName')}>
            <input
              className="console-form-control"
              value={draft.api_name}
              onChange={(e) => setDraft({ ...draft, api_name: e.target.value })}
              placeholder="turtle"
              disabled={!!editing}
            />
          </FormField>
          <FormField label={t('editor.external.displayName')}>
            <input
              className="console-form-control"
              value={draft.display_name}
              onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
            />
          </FormField>
          <FormField label={t('editor.external.baseUrl')}>
            <input
              className="console-form-control"
              value={draft.base_url}
              onChange={(e) => setDraft({ ...draft, base_url: e.target.value })}
              placeholder="http://backend:8200"
            />
          </FormField>
          <FormField label={t('editor.external.auth')}>
            <select
              className="console-form-control"
              value={draft.auth_kind}
              onChange={(e) => setDraft({ ...draft, auth_kind: e.target.value as Draft['auth_kind'] })}
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
              hint={editing?.has_secret ? t('editor.external.secretKeepHint') : undefined}
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
          <FormField label={t('editor.external.allowedPaths')} hint={t('editor.external.allowedPathsHint')}>
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
      ) : loading ? (
        <p className="external-services__hint">{t('shared.loading')}</p>
      ) : services.length === 0 ? (
        <p className="external-services__hint">{t('editor.external.empty')}</p>
      ) : (
        <div className="ds-table-wrap">
          <table className="console-table">
            <thead>
              <tr>
                <th>{t('editor.external.apiName')}</th>
                <th>{t('editor.external.baseUrl')}</th>
                <th>{t('editor.external.auth')}</th>
                <th>{t('editor.external.allowedPaths')}</th>
                <th className="console-table-actions">{t('shared.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.id}>
                  <td>
                    <code>{service.api_name}</code>
                    <div className="external-services__name">{service.display_name}</div>
                  </td>
                  <td>
                    <code>{service.base_url}</code>
                  </td>
                  <td>{service.auth_kind === 'none' ? '—' : service.auth_kind}</td>
                  <td>
                    <code>{service.allowed_paths.join(' ')}</code>
                  </td>
                  <td className="console-table-actions">
                    <div className="console-table-btns">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => openEdit(service)}
                        aria-label={t('shared.edit')}
                      >
                        <Pencil size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => void onDelete(service)}
                        aria-label={t('shared.delete')}
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}
