import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, Save } from 'lucide-react';
import { toast } from 'sonner';
import { deleteWorkforceAgent, updateWorkforceAgent } from '../../../data/workforceApi';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { EntityViewField, EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { configFromDraft, draftFromConfig } from '../workforceConfigDraft';
import { useWorkforceDetail } from './workforceDetailContext';

/**
 * Who the service is: the name a caller sees, the line saying what it is for, and what it has been told.
 *
 * Instructions sit here rather than in a tab of their own because they are the same kind of thing — prompt
 * text that shapes identity and conduct. What is *not* here is anything the runtime must enforce: the answer
 * policy and the tool set are separate, because a rule that only exists in a prompt can be argued with.
 *
 * Archive lives here because it is the one action that ends the service — kept beside Save, and behind a
 * confirm, rather than beside the tab's primary action.
 */
export function WorkforceProfileTab() {
  const { t } = useTranslation('workforce');
  const confirm = useConfirm();
  const { agent, reload } = useWorkforceDetail();
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? '');
  const [instructions, setInstructions] = useState(
    agent.agent_config?.prompts?.agents_md ?? ''
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateWorkforceAgent(agent.id, {
        name: name.trim() || agent.name,
        description: description.trim() || null,
        // Only the one config key this tab owns; the rest is merged on the server side of the form.
        agent_config: configFromDraft(agent.agent_config, {
          ...draftFromConfig(agent.agent_config),
          agentsMd: instructions,
        }),
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
      await deleteWorkforceAgent(agent.id);
      toast.success(t('deleted'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('deleteFailed'));
    }
  };

  return (
    <>
      <EntityViewHeader
        title={t('profileTitle')}
        subtitle={t('profileLead')}
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
          <EntityViewField label={t('instructions')} hint={t('instructionsHint')}>
            <textarea
              className="ds-control"
              rows={8}
              value={instructions}
              placeholder={t('instructionsPlaceholder')}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </EntityViewField>
        </div>
      </EntityViewPanel>
    </>
  );
}
