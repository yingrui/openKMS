import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createWorkforceCredential,
  fetchWorkforceCredentials,
  revokeWorkforceCredential,
  type WorkforceCredential,
  type WorkforceCredentialCreated,
} from '../../../data/workforceApi';
import { useConfirm } from '../../../contexts/ConfirmContext';
import {
  Dialog,
  EmptyState,
  FormField,
  StatusChip,
  TableRowActionButton,
  TableRowActionCell,
  TableRowActions,
} from '../../../styles/design-system';
import { EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { useWorkforceDetail } from './workforceDetailContext';

/**
 * Who may call this agent.
 *
 * A credential belongs to the agent, not to a person: revoking it stops this service and leaves the owner's
 * own sign-in alone. The token is shown once — only its hash is stored, so an operator who loses it issues a
 * new one rather than hunting for the old.
 */
export function WorkforceAccessTab() {
  const { t } = useTranslation('workforce');
  const confirm = useConfirm();
  const { agent, reload } = useWorkforceDetail();
  const [items, setItems] = useState<WorkforceCredential[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<WorkforceCredentialCreated | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await fetchWorkforceCredentials(agent.id)).items);
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
      setCreated(await createWorkforceCredential(agent.id, name.trim()));
      setName('');
      await load();
      await reload();
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
      await reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('revokeFailed'));
    }
  };

  return (
    <>
      <EntityViewHeader title={t('accessTitle')} subtitle={t('accessLead')} />
      <EntityViewPanel>
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
      </EntityViewPanel>

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
    </>
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
