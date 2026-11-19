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
 * Sampling and thinking depth belong on this screen because they are request parameters, not sentences to
 * write into a prompt: the qa-agent reads `generation.temperature` and `generation.thinking` and sends them
 * with the call. Empty means "whatever the deployment does", which is the behaviour before they existed.
 */
export function WorkforceModelTab() {
  const { t } = useTranslation('workforce');
  const { agent, reload } = useWorkforceDetail();
  const [draft, setDraft] = useState(() => draftFromConfig(agent.agent_config));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateWorkforceAgent(agent.id, {
        agent_config: configFromDraft(agent.agent_config, draft),
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
        <div className="entity-view__form">
          <FormField label={t('model')} hint={t('modelHint')}>
            <input
              className="ds-control"
              value={draft.modelId}
              placeholder={t('modelPlaceholder')}
              onChange={(e) => setDraft({ ...draft, modelId: e.target.value })}
            />
          </FormField>
          <FormField label={t('temperature')} hint={t('temperatureHint')}>
            <input
              className="ds-control"
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={draft.temperature}
              placeholder={t('temperaturePlaceholder')}
              onChange={(e) => setDraft({ ...draft, temperature: e.target.value })}
            />
          </FormField>
          <FormField label={t('thinking')} hint={t('thinkingHint')}>
            <select
              className="ds-control"
              value={draft.thinking}
              onChange={(e) =>
                setDraft({ ...draft, thinking: e.target.value as typeof draft.thinking })
              }
            >
              <option value="default">{t('thinkingDefault')}</option>
              <option value="on">{t('thinkingOn')}</option>
              <option value="off">{t('thinkingOff')}</option>
            </select>
          </FormField>
        </div>
      </EntityViewPanel>
    </>
  );
}
