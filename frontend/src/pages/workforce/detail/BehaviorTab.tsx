import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { updateWorkforceAgent } from '../../../data/workforceApi';
import { CheckRow, FormField } from '../../../styles/design-system';
import { EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { configFromDraft, draftFromConfig, type BehaviourDraft } from '../workforceConfigDraft';
import { useWorkforceDetail } from './workforceDetailContext';

/**
 * What counts as an acceptable answer, and how far the agent may go to produce one.
 *
 * These are not instructions to the model: the agent checks them. A number without a cited source is
 * *marked* (or refused) by the runtime, and a tool-round ceiling is enforced by the loop — written into a
 * prompt, either could be argued away by a clever question.
 */
export function WorkforceBehaviorTab() {
  const { t } = useTranslation('workforce');
  const { agent, reload } = useWorkforceDetail();
  const [draft, setDraft] = useState<BehaviourDraft>(() => draftFromConfig(agent.agent_config));
  const [saving, setSaving] = useState(false);

  const patch = (values: Partial<BehaviourDraft>) => setDraft((d) => ({ ...d, ...values }));

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
        title={t('behaviorTitle')}
        subtitle={t('behaviorLead')}
        actions={
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
            <Save size={16} aria-hidden />
            {saving ? t('saving') : t('save')}
          </button>
        }
      />

      <EntityViewPanel title={t('answerPolicy')}>
        <div className="entity-view__form">
          <FormField label={t('unknownMeasure')}>
            <select
              className="ds-control"
              value={draft.unknownMeasure}
              onChange={(e) =>
                patch({ unknownMeasure: e.target.value as BehaviourDraft['unknownMeasure'] })
              }
            >
              <option value="try_anyway">{t('unknownMeasureTry')}</option>
              <option value="refuse">{t('unknownMeasureRefuse')}</option>
            </select>
          </FormField>
          <FormField label={t('grounding')}>
            <select
              className="ds-control"
              value={draft.grounding}
              onChange={(e) => patch({ grounding: e.target.value as BehaviourDraft['grounding'] })}
            >
              <option value="off">{t('groundingOff')}</option>
              <option value="mark">{t('groundingMark')}</option>
              <option value="enforce">{t('groundingEnforce')}</option>
            </select>
          </FormField>
        </div>
        <CheckRow
          checked={draft.schemaLookup}
          onChange={(checked) => patch({ schemaLookup: checked })}
          title={t('schemaLookup')}
        />
      </EntityViewPanel>

      <EntityViewPanel title={t('orchestration')}>
        <div className="entity-view__form">
          <FormField label={t('maxToolRounds')} hint={t('maxToolRoundsHint')}>
            <input
              className="ds-control"
              type="number"
              min={1}
              max={100}
              value={draft.maxToolRounds}
              onChange={(e) => patch({ maxToolRounds: e.target.value })}
            />
          </FormField>
        </div>
      </EntityViewPanel>
    </>
  );
}
