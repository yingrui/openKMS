import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createWorkforceCredential,
  fetchWorkforceCredentials,
  revokeWorkforceCredential,
  type WorkforceAgentDetail,
  type WorkforceCredential,
  type WorkforceCredentialCreated,
} from '../../data/workforceApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import {
  Dialog,
  EmptyState,
  FormField,
  StatusChip,
  TableRowActionButton,
  TableRowActionCell,
  TableRowActions,
} from '../../styles/design-system';
import { EntityViewPanel } from '../shared/EntityViewShell';

/**
 * Who may call this agent.
 *
 * A credential belongs to the agent, not to a person: revoking it stops this service and leaves the
 * owner's own sign-in alone. The token is shown once — only its hash is stored, so an operator who
 * loses it issues a new one rather than hunting for the old.
 */
export function WorkforceAccessPanel({
  agent,
  onChanged,
}: {
  agent: WorkforceAgentDetail;
  onChanged: () => void;
}) {
  const { t } = useTranslation('workforce');
  const confirm = useConfirm();
  const [items, setItems] = useState<WorkforceCredential[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<WorkforceCredentialCreated | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchWorkforceCredentials(agent.id);
      setItems(data.items);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('credentialFailed'));
    }
  }, [agent.id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const token = await createWorkforceCredential(agent.id, name.trim());
      setCreated(token);
      setName('');
      await load();
      onChanged();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('credentialFailed'));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (row: WorkforceCredential) => {
    if (
      !(await confirm({
        title: t('revoke'),
        message: t('revokeConfirm', { name: row.name || row.key_prefix }),
        confirmLabel: t('revoke'),
        danger: true,
      }))
    ) {
      return;
    }
    try {
      await revokeWorkforceCredential(agent.id, row.id);
      toast.success(t('revoked'));
      await load();
      onChanged();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('revokeFailed'));
    }
  };

  return (
    <EntityViewPanel id="access" title={t('accessTitle')} description={t('accessLead')}>
      <p className="ds-field__hint">{t('readOnlyNote')}</p>

      {items.length === 0 ? (
        <EmptyState icon={<KeyRound size={32} strokeWidth={1} />} description={t('noCredentials')} />
      ) : (
        <div className="ds-table-wrap ds-table-wrap--flush">
          <table className="ds-table">
            <thead>
              <tr>
                <th>{t('credentialName')}</th>
                <th>{t('lastUsed')}</th>
                <TableRowActionCell as="th">
                  <span className="sr-only">{t('revoke')}</span>
                </TableRowActionCell>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.name || row.key_prefix}
                    <div className="page-subtitle">{row.key_prefix}…</div>
                  </td>
                  <td>{row.last_used_at ? new Date(row.last_used_at).toLocaleString() : t('neverUsed')}</td>
                  <TableRowActionCell>
                    {row.revoked_at ? (
                      <StatusChip>{t('revokedChip')}</StatusChip>
                    ) : (
                      <TableRowActions>
                        <TableRowActionButton
                          title={t('revoke')}
                          aria-label={t('revoke')}
                          variant="danger"
                          icon={<Trash2 size={16} />}
                          onClick={() => void revoke(row)}
                        />
                      </TableRowActions>
                    )}
                  </TableRowActionCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FormField label={t('createCredential')}>
        <div className="workforce-inline-form">
          <input
            className="ds-control"
            value={name}
            placeholder={t('credentialNamePlaceholder')}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || !name.trim()}
            onClick={() => void create()}
          >
            <Plus size={16} aria-hidden />
            {t('createCredential')}
          </button>
        </div>
      </FormField>

      <Dialog
        open={created !== null}
        onClose={() => setCreated(null)}
        title={t('credentialCreatedTitle')}
        footer={
          <button type="button" className="btn btn-primary" onClick={() => setCreated(null)}>
            {t('close')}
          </button>
        }
      >
        <p className="ds-field__hint">{t('credentialCreatedBody')}</p>
        {created ? <TokenBox token={created.token} label={created.name || created.key_prefix} /> : null}
      </Dialog>
    </EntityViewPanel>
  );
}

function TokenBox({ token, label }: { token: string; label: string }) {
  const { t } = useTranslation('workforce');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      toast.success(t('copied'));
    } catch {
      /* The token is on screen; a clipboard the browser refuses is not an error worth a toast. */
    }
  };

  return (
    <div className="workforce-token">
      <span className="ds-field__hint">{label}</span>
      <code>{token}</code>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy()}>
        <Copy size={14} aria-hidden />
        {t('copy')}
      </button>
    </div>
  );
}

/**
 * The exact request an integrator sends.
 *
 * It exists because "there is a credential" is not enough to call the service: the reader needs the
 * shape of the body, the endpoint, and which knowledge source the question names. Shown rather than
 * executed — a call from this page would run as *you*, which is the thing the credential replaces.
 */
export function WorkforceCallPanel({ agent }: { agent: WorkforceAgentDetail }) {
  const { t } = useTranslation('workforce');
  const kbId = agent.knowledge_bases[0]?.knowledge_base_id ?? '<knowledge-base-id>';

  const curl = useMemo(
    () =>
      [
        `curl -X POST \\`,
        `  ${window.location.origin}/api/workforce/agents/${agent.id}/ask \\`,
        `  -H "Authorization: Bearer wfks.<credential-id>.<secret>" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '{"kb_id": "${kbId}", "question": "..."}'`,
      ].join('\n'),
    [agent.id, kbId],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(curl);
      toast.success(t('copied'));
    } catch {
      /* ignore */
    }
  };

  return (
    <EntityViewPanel id="call" title={t('tryTitle')} description={t('tryLead')}>
      <pre className="workforce-curl">{curl}</pre>
      <button type="button" className="btn btn-secondary" onClick={() => void copy()}>
        <Copy size={16} aria-hidden />
        {t('copyCurl')}
      </button>
    </EntityViewPanel>
  );
}
