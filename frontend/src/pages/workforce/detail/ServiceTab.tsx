import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  deleteWorkforceAgent,
  pauseWorkforceAgent,
  resumeWorkforceAgent,
} from '../../../data/workforceApi';
import { FormField, StatusChip } from '../../../styles/design-system';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { updateWorkforceAgent } from '../../../data/workforceApi';
import { configFromDraft, draftFromConfig, type BehaviourDraft } from '../workforceConfigDraft';
import { EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { useWorkforceDetail } from './workforceDetailContext';

/**
 * Whether this agent answers, and how to take it out of service.
 *
 * A tab of its own rather than a block on another page: pausing and deleting are not settings of the answer — they are
 * the decision that there should be an answer at all, and an operator looking for them should not have to know which
 * page they were filed under. The status chip also stays in the identity row, so "is it live?" needs no click;
 * this page is for the two actions that change it.
 */
export function WorkforceServiceTab() {
  const { t } = useTranslation('workforce');
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { agent, reload } = useWorkforceDetail();
  const [draft, setDraft] = useState<BehaviourDraft>(() => draftFromConfig(agent.agent_config));
  const [busy, setBusy] = useState(false);

  /** What a caller reads while the service is down — edited next to the button that takes it down. */
  const savePausedMessage = async () => {
    setBusy(true);
    try {
      await updateWorkforceAgent(agent.id, {
        agent_config: configFromDraft(agent.agent_config, draft),
      });
      await reload();
      toast.success(t('saved'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const setServing = async (paused: boolean) => {
    setBusy(true);
    try {
      await (paused ? pauseWorkforceAgent(agent.id) : resumeWorkforceAgent(agent.id));
      toast.success(paused ? t('paused') : t('resumed'));
      await reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
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
      navigate('/workforce');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('deleteFailed'));
    }
  };

  const paused = agent.status === 'paused';

  return (
    <>
      <EntityViewHeader title={t('serviceTitle')} subtitle={t('serviceLead')} />
      <EntityViewPanel title={t('serviceStateTitle')} description={t('pauseHint')}>
        <div className="workforce-service">
          <StatusChip tone={paused ? 'warn' : 'ok'}>{t(`status_${agent.status}`)}</StatusChip>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={() => void setServing(!paused)}
          >
            {paused ? t('resumeAgent') : t('pauseAgent')}
          </button>
        </div>
      </EntityViewPanel>

      <EntityViewPanel
        title={t('pausedMessageTitle')}
        description={t('pausedMessageHint')}
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={() => void savePausedMessage()}
          >
            {t('save')}
          </button>
        }
      >
        <FormField label={t('pausedMessage')}>
          <textarea
            className="ds-control"
            rows={2}
            value={draft.pausedMessage}
            placeholder={t('pausedMessagePlaceholder')}
            onChange={(e) => setDraft((d) => ({ ...d, pausedMessage: e.target.value }))}
          />
        </FormField>
      </EntityViewPanel>

      <EntityViewPanel title={t('deleteAgentTitle')} description={t('deleteAgentHint')}>
        <div className="workforce-service">
          <span className="ds-field__hint">{agent.name}</span>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={busy}
            onClick={() => void remove()}
          >
            {t('archiveAgent')}
          </button>
        </div>
      </EntityViewPanel>
    </>
  );
}
