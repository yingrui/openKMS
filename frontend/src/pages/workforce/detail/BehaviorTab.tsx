import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { updateWorkforceAgent } from '../../../data/workforceApi';
import { CORE_AGENT_SKILLS, OPTIONAL_AGENT_SKILLS } from '../../../data/kbAgentSkills';
import { CheckRow, FormField } from '../../../styles/design-system';
import { EntityViewField, EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { configFromDraft, draftFromConfig, type BehaviourDraft } from '../workforceConfigDraft';
import { useWorkforceDetail } from './workforceDetailContext';

/**
 * How the agent answers: its instructions, model, skills, answer policy, orchestration and the two
 * capabilities that touch the workspace.
 *
 * Retrieval depth is deliberately absent — it belongs to the knowledge source, and offering it here would
 * let one corpus be searched two different ways.
 */
export function WorkforceBehaviorTab() {
  const { t } = useTranslation('workforce');
  const { t: tk } = useTranslation('knowledgeBase');
  const { agent, reload } = useWorkforceDetail();
  const [skills, setSkills] = useState<string[]>(
    Array.isArray(agent.agent_skills) ? agent.agent_skills : []
  );
  const [draft, setDraft] = useState<BehaviourDraft>(() => draftFromConfig(agent.agent_config));
  const [saving, setSaving] = useState(false);

  const patch = (values: Partial<BehaviourDraft>) => setDraft((d) => ({ ...d, ...values }));
  const toggleSkill = (id: string) =>
    setSkills((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const save = async () => {
    setSaving(true);
    try {
      await updateWorkforceAgent(agent.id, {
        agent_skills: skills,
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

  const skillRow = (skill: (typeof CORE_AGENT_SKILLS)[number]) => (
    <CheckRow
      key={skill.id}
      checked={skills.includes(skill.id)}
      onChange={() => toggleSkill(skill.id)}
      title={tk(`detail.${skill.labelKey}`)}
      hint={tk(`detail.${skill.helpKey}`)}
    />
  );

  return (
    <>
      <EntityViewHeader
        title={t('behaviorTitle')}
        subtitle={t('behaviorLead')}
        actions={
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={() => void save()}
          >
            <Save size={16} aria-hidden />
            {saving ? t('saving') : t('save')}
          </button>
        }
      />

      <EntityViewPanel>
        <div className="entity-view__form">
          <EntityViewField label={t('instructions')} hint={t('instructionsHint')}>
            <textarea
              className="ds-control"
              rows={6}
              value={draft.agentsMd}
              placeholder={t('instructionsPlaceholder')}
              onChange={(e) => patch({ agentsMd: e.target.value })}
            />
          </EntityViewField>
          <FormField label={t('model')} hint={t('modelHint')}>
            <input
              className="ds-control"
              value={draft.modelId}
              placeholder={t('modelPlaceholder')}
              onChange={(e) => patch({ modelId: e.target.value })}
            />
          </FormField>
        </div>
      </EntityViewPanel>

      <EntityViewPanel title={t('skills')} description={t('skillsHint')}>
        {CORE_AGENT_SKILLS.map(skillRow)}
        {OPTIONAL_AGENT_SKILLS.map(skillRow)}
      </EntityViewPanel>

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
          <FormField label={t('retrieve')}>
            <select
              className="ds-control"
              value={draft.retrieve}
              onChange={(e) => patch({ retrieve: e.target.value as BehaviourDraft['retrieve'] })}
            >
              <option value="always">{t('retrieveAlways')}</option>
              <option value="on_miss">{t('retrieveOnMiss')}</option>
              <option value="never">{t('retrieveNever')}</option>
            </select>
          </FormField>
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
        <CheckRow
          checked={draft.workspace}
          onChange={(checked) => patch({ workspace: checked })}
          title={t('workspace')}
          hint={t('workspaceHint')}
        />
        <CheckRow
          checked={draft.sandbox}
          onChange={(checked) => patch({ sandbox: checked })}
          title={t('sandbox')}
          hint={t('sandboxHint')}
        />
      </EntityViewPanel>
    </>
  );
}
