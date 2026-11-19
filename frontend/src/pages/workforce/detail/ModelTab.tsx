import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { updateWorkforceAgent } from '../../../data/workforceApi';
import { fetchModels, type ApiModelResponse } from '../../../data/modelsApi';
import { FormField } from '../../../styles/design-system';
import { EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { configFromDraft, draftFromConfig } from '../workforceConfigDraft';
import { SAMPLING_PRESETS, applyPreset, matchPreset } from '../samplingPresets';
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
 *
 * Temperature and top-p are described by what they change (how varied the wording is; how wide the candidate pool is)
 * rather than by their statistical names: "nucleus sampling" is the correct term and tells a reader nothing they can
 * act on. The hints also carry the practice — tune one, leave the other at its default.
 *
 * The model is a select over the registered chat models, not free text: the registry is what the backend can resolve
 * credentials for, and a typo there produced an agent that answered with something else entirely. Empty means the
 * deployment's default model.
 */
export function WorkforceModelTab() {
  const { t } = useTranslation('workforce');
  const { agent, reload } = useWorkforceDetail();
  const [draft, setDraft] = useState(() => draftFromConfig(agent.agent_config));
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState<ApiModelResponse[]>([]);

  const loadModels = useCallback(async () => {
    try {
      const res = await fetchModels({ api_kind: 'chat-completions', limit: 200, offset: 0 });
      setModels(res.items);
    } catch {
      // The select falls back to the current value; models are a convenience, not a precondition.
    }
  }, []);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const preset = matchPreset(draft);
  const setPreset = (id: (typeof SAMPLING_PRESETS)[number]['id']) => {
    const chosen = SAMPLING_PRESETS.find((p) => p.id === id);
    if (chosen) setDraft((current) => applyPreset(current, chosen));
  };

  // Group by provider so two models with the same vendor name stay distinguishable.
  const modelsByProvider = models.reduce<Record<string, ApiModelResponse[]>>((acc, m) => {
    (acc[m.provider_name] ??= []).push(m);
    return acc;
  }, {});

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
            <select
              className="ds-control"
              value={draft.modelId}
              onChange={(e) => setDraft({ ...draft, modelId: e.target.value })}
            >
              <option value="">{t('modelDefault')}</option>
              {Object.entries(modelsByProvider).map(([provider, items]) => (
                <optgroup key={provider} label={provider}>
                  {items.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              ))}
              {/* A saved model that is no longer in the list stays visible, so saving does not silently drop it. */}
              {draft.modelId && !models.some((m) => m.id === draft.modelId) ? (
                <option value={draft.modelId}>{t('modelMissing')}</option>
              ) : null}
            </select>
          </FormField>
          {/* A row of starting points. It sets both fields, then leaves them editable — a preset is not a mode. */}
          <FormField label={t('samplingPreset')} hint={t('samplingPresetHint')}>
            <div className="workforce-segmented" role="group" aria-label={t('samplingPreset')}>
              {SAMPLING_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`workforce-segmented__btn${preset === p.id ? ' active' : ''}`}
                  aria-pressed={preset === p.id}
                  onClick={() => setPreset(p.id)}
                >
                  {t(`samplingPreset_${p.id}`)}
                </button>
              ))}
            </div>
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
          <FormField label={t('thinkingMode')}>
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
              {/* Stored values are the API's (`low | high | max`); the wording is the product's. */}
              <option value="low">{t('reasoningEffortLow')}</option>
              <option value="high">{t('reasoningEffortHigh')}</option>
              <option value="max">{t('reasoningEffortMax')}</option>
            </select>
          </FormField>
        </div>
      </EntityViewPanel>
    </>
  );
}
