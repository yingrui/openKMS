import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { updateWorkforceAgent } from '../../../data/workforceApi';
import { EntityViewField, EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { configFromDraft, draftFromConfig } from '../workforceConfigDraft';
import { useWorkforceDetail } from './workforceDetailContext';

/** The same cap the backend validates against. */
const MAX_CHARS = 20_000;

/**
 * The inputs that shape the service, and nothing else.
 *
 * Identity (name, description) opens the prompt; the instruction is its body; AGENTS.md is memory — injected as a
 * section and written into the conversation's workspace. All three are text an author owns.
 *
 * What is *not* here: the assembled prompt (its own tab, because it is composed from every tab), and deleting (the
 * list, because that is a decision about which services exist). Both used to live here and both were category errors.
 */
export function WorkforceProfileTab() {
  const { t } = useTranslation('workforce');
  const { agent, reload } = useWorkforceDetail();
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? '');
  const [instruction, setInstruction] = useState(agent.agent_config?.prompts?.system_prompt ?? '');
  const [agentsMd, setAgentsMd] = useState(agent.agent_config?.prompts?.agents_md ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateWorkforceAgent(agent.id, {
        name: name.trim() || agent.name,
        description: description.trim() || null,
        agent_config: configFromDraft(agent.agent_config, {
          ...draftFromConfig(agent.agent_config),
          systemPrompt: instruction,
          agentsMd,
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

  const counter = (value: string) => (
    <span className={value.length > MAX_CHARS ? 'workforce-editor__count is-over' : 'workforce-editor__count'}>
      {t('editorCount', { count: value.length, max: MAX_CHARS })}
    </span>
  );

  return (
    <>
      <EntityViewHeader
        title={t('profileTitle')}
        subtitle={t('profileLead')}
        actions={
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || instruction.length > MAX_CHARS || agentsMd.length > MAX_CHARS}
            onClick={() => void save()}
          >
            <Save size={16} aria-hidden />
            {saving ? t('saving') : t('save')}
          </button>
        }
      />

      <EntityViewPanel title={t('identityTitle')} description={t('identityLead')}>
        <div className="workforce-stack">
          <EntityViewField label={t('name')}>
            <input className="ds-control" value={name} onChange={(e) => setName(e.target.value)} />
          </EntityViewField>
          <EntityViewField label={t('description')} hint={t('descriptionHint')}>
            <textarea
              className="ds-control"
              rows={3}
              value={description}
              placeholder={t('descriptionPlaceholder')}
              onChange={(e) => setDescription(e.target.value)}
            />
          </EntityViewField>
        </div>
      </EntityViewPanel>

      <EntityViewPanel title={t('instructionTitle')} description={t('instructionLead')}>
        <div className="workforce-editor">
          <textarea
            className="ds-control workforce-editor__input"
            rows={10}
            spellCheck={false}
            value={instruction}
            placeholder={t('instructionPlaceholder')}
            onChange={(e) => setInstruction(e.target.value)}
          />
          <div className="workforce-editor__meta">{counter(instruction)}</div>
        </div>
      </EntityViewPanel>

      <EntityViewPanel title={t('agentsMdTitle')} description={t('agentsMdLead')}>
        <div className="workforce-editor">
          <textarea
            className="ds-control workforce-editor__input"
            rows={8}
            spellCheck={false}
            value={agentsMd}
            placeholder={t('agentsMdPlaceholder')}
            onChange={(e) => setAgentsMd(e.target.value)}
          />
          <div className="workforce-editor__meta">
            {counter(agentsMd)}
            <span className="ds-field__hint">{t('agentsMdNote')}</span>
          </div>
        </div>
      </EntityViewPanel>
    </>
  );
}
