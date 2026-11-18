import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, Save } from 'lucide-react';
import { toast } from 'sonner';
import { archiveWorkforceAgent, updateWorkforceAgent } from '../../../data/workforceApi';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { EntityViewField, EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { useWorkforceDetail } from './workforceDetailContext';

/**
 * Who the service is: the name a caller sees and the line saying what it is for.
 *
 * Archive lives here because it is the one action that ends the service — kept beside Save, and behind a
 * confirm, rather than beside the tab's primary action.
 */
export function WorkforceIdentityTab() {
  const { t } = useTranslation('workforce');
  const confirm = useConfirm();
  const { agent, reload } = useWorkforceDetail();
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateWorkforceAgent(agent.id, {
        name: name.trim() || agent.name,
        description: description.trim() || null,
      });
      await reload();
      toast.success(t('saved'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (
      !(await confirm({
        title: t('archiveAgent'),
        message: t('archiveConfirm', { name: agent.name }),
        confirmLabel: t('archiveAgent'),
        danger: true,
      }))
    ) {
      return;
    }
    try {
      await archiveWorkforceAgent(agent.id);
      toast.success(t('deleted'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('deleteFailed'));
    }
  };

  return (
    <>
      <EntityViewHeader
        title={t('identityTitle')}
        subtitle={t('identityLead')}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => void archive()}>
              <Archive size={16} aria-hidden />
              {t('archiveAgent')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={() => void save()}
            >
              <Save size={16} aria-hidden />
              {saving ? t('saving') : t('save')}
            </button>
          </>
        }
      />

      <EntityViewPanel>
        <div className="entity-view__form">
          <EntityViewField label={t('name')}>
            <input className="ds-control" value={name} onChange={(e) => setName(e.target.value)} />
          </EntityViewField>
          <EntityViewField label={t('description')}>
            <textarea
              className="ds-control"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </EntityViewField>
        </div>
      </EntityViewPanel>
    </>
  );
}
