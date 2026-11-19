import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { updateWorkforceAgent } from '../../../data/workforceApi';
import { FormField } from '../../../styles/design-system';
import { EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { configFromDraft, draftFromConfig } from '../workforceConfigDraft';
import { useWorkforceDetail } from './workforceDetailContext';

/**
 * Which model answers.
 *
 * Sampling and thinking depth belong on this screen — they are request parameters, not sentence to write
 * into a prompt — but the runtime does not read them yet (qa-agent still sends a fixed temperature and
 * turns thinking off), so the tab says so instead of offering switches that would do nothing.
 */
export function WorkforceModelTab() {
  const { t } = useTranslation('workforce');
  const { agent, reload } = useWorkforceDetail();
  const [modelId, setModelId] = useState(draftFromConfig(agent.agent_config).modelId);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateWorkforceAgent(agent.id, {
        agent_config: configFromDraft(agent.agent_config, {
          ...draftFromConfig(agent.agent_config),
          modelId,
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

  return (
    <>
      <EntityViewHeader
        title={t('modelTitle')}
        subtitle={t('modelLead')}
        actions={
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
            <Save size={16} aria-hidden />
            {saving ? t('saving') : t('save')}
          </button>
        }
      />
      <EntityViewPanel>
        <FormField label={t('model')} hint={t('modelHint')}>
          <input
            className="ds-control"
            value={modelId}
            placeholder={t('modelPlaceholder')}
            onChange={(e) => setModelId(e.target.value)}
          />
        </FormField>
        <p className="ds-field__hint">{t('modelFixedHint')}</p>
      </EntityViewPanel>
    </>
  );
}
