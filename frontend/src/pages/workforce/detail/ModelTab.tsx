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
 * write into a prompt: the qa-agent reads `generation.{temperature,top_p,max_tokens,thinking}` and sends them
 * with the call. Empty means "whatever the deployment does", which is the behaviour before they existed.
 *
 * The field is named after the concept, not the transport: "thinking mode" is what DeepSeek's and OpenAI's docs call
 * it, and what a reader can look up. Its former third option read "whatever the deployment does" — a value stored in
 * an environment variable nobody looking at this screen had seen, and one the agent could not honour anyway.
 *
 * The hint carries the two things a chooser needs: what it buys (reasoning before the answer), what it costs (latency,
 * tokens), and the side effect the provider documents — while thinking is on, `temperature` is ignored.
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
          <FormField label={t('topP')} hint={t('topPHint')}>
            <input
              className="ds-control"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={draft.topP}
              placeholder={t('topPPlaceholder')}
              onChange={(e) => setDraft({ ...draft, topP: e.target.value })}
            />
          </FormField>
          <FormField label={t('maxTokens')} hint={t('maxTokensHint')}>
            <input
              className="ds-control"
              type="number"
              min={1}
              max={32768}
              step={256}
              value={draft.maxTokens}
              placeholder={t('maxTokensPlaceholder')}
              onChange={(e) => setDraft({ ...draft, maxTokens: e.target.value })}
            />
          </FormField>
          <FormField label={t('thinkingMode')} hint={t('thinkingModeHint')}>
            <select
              className="ds-control"
              value={draft.thinking}
              onChange={(e) =>
                setDraft({ ...draft, thinking: e.target.value as typeof draft.thinking })
              }
            >
              <option value="off">{t('thinkingModeOff')}</option>
              <option value="on">{t('thinkingModeOn')}</option>
            </select>
          </FormField>
          {/* Level of reasoning. Disabled while thinking is off, because the runtime drops it then — a value that
              looks settable but is ignored is the failure mode this screen is trying to avoid. */}
          <FormField label={t('reasoningEffort')} hint={t('reasoningEffortHint')}>
            <select
              className="ds-control"
              value={draft.reasoningEffort}
              disabled={draft.thinking === 'off'}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  reasoningEffort: e.target.value as typeof draft.reasoningEffort,
                })
              }
            >
              <option value="">{t('reasoningEffortDefault')}</option>
              <option value="minimal">{t('reasoningEffortMinimal')}</option>
              <option value="low">{t('reasoningEffortLow')}</option>
              <option value="medium">{t('reasoningEffortMedium')}</option>
              <option value="high">{t('reasoningEffortHigh')}</option>
              <option value="max">{t('reasoningEffortMax')}</option>
            </select>
          </FormField>
        </div>
      </EntityViewPanel>
    </>
  );
}
