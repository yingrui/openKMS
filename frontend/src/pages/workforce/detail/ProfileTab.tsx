import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, Code2, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteWorkforceAgent,
  fetchPromptPreview,
  updateWorkforceAgent,
  type WorkforcePromptPreview,
} from '../../../data/workforceApi';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { EntityViewField, EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { configFromDraft, draftFromConfig } from '../workforceConfigDraft';
import { useWorkforceDetail } from './workforceDetailContext';

/**
 * Who the service is: the name a caller sees, the line saying what it is for, and what it has been told.
 *
 * Two different texts live here, and they are labelled as different things — the way Dify separates Instructions from
 * everything else:
 *
 * - **Instructions** are the agent's system prompt. One field, sent with every answer; the skill descriptions, the
 *   answer policy and the retrieved passages are appended by the runtime, never written here.
 * - **Workspace conventions** are `AGENTS.md` — a file in the session workspace that the model reads through the file
 *   tools when it needs them. Not part of the prompt, which is why it is named after the file rather than after
 *   "instructions".
 *
 * What is *not* here: the answer policy and the enabled skills, because a rule that lives only in prompt text can be
 * argued with.
 *
 * "Model input" shows the assembled text rather than explaining it: the system prompt from the qa-agent's own builder,
 * and the AGENTS.md that the session workspace receives. It is a page panel, not a dialog, because both texts are long
 * and are compared line by line against the fields above.
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
  const [baseInstruction, setBaseInstruction] = useState(
    agent.agent_config?.prompts?.system_prompt ?? ''
  );
  const [instructions, setInstructions] = useState(
    agent.agent_config?.prompts?.agents_md ?? ''
  );
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<WorkforcePromptPreview | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const sourceId = agent.knowledge_bases[0]?.knowledge_base_id ?? null;

  const togglePreview = async () => {
    if (!sourceId) return;
    const next = !previewVisible;
    setPreviewVisible(next);
    if (!next || preview) return;
    setPreviewError(null);
    try {
      setPreview(await fetchPromptPreview(agent.id, sourceId));
    } catch (e: unknown) {
      setPreviewError(e instanceof Error ? e.message : t('previewFailed'));
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateWorkforceAgent(agent.id, {
        name: name.trim() || agent.name,
        description: description.trim() || null,
        // Only the one config key this tab owns; the rest is merged on the server side of the form.
        agent_config: configFromDraft(agent.agent_config, {
          ...draftFromConfig(agent.agent_config),
          systemPrompt: baseInstruction,
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
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!sourceId}
              title={sourceId ? undefined : t('previewNeedsSource')}
              onClick={() => void togglePreview()}
            >
              <Code2 size={16} aria-hidden />
              {previewVisible ? t('previewHide') : t('previewOpen')}
            </button>
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
          <EntityViewField label={t('systemPromptLabel')} hint={t('systemPromptHint')}>
            <textarea
              className="ds-control"
              rows={6}
              value={baseInstruction}
              placeholder={t('systemPromptPlaceholder')}
              onChange={(e) => setBaseInstruction(e.target.value)}
            />
          </EntityViewField>
          <EntityViewField label={t('agentsMdLabel')} hint={t('agentsMdHint')}>
            <textarea
              className="ds-control"
              rows={6}
              value={instructions}
              placeholder={t('agentsMdPlaceholder')}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </EntityViewField>
        </div>
      </EntityViewPanel>

      {previewVisible ? (
        <EntityViewPanel title={t('previewTitle')} description={t('previewLead')}>
          {previewError ? (
            <p className="ds-field__hint page-subtitle--error">{previewError}</p>
          ) : preview ? (
            <>
              <p className="ds-field__hint">{t('previewLegend')}</p>
              <h3 className="ds-compact-label">{t('previewSystemPrompt')}</h3>
              <pre className="workforce-prompt-preview">{preview.system_prompt}</pre>

              <h3 className="ds-compact-label">{t('previewAgentsMd')}</h3>
              {preview.agents_md ? (
                <pre className="workforce-prompt-preview">{preview.agents_md}</pre>
              ) : (
                <p className="ds-field__hint">{t('previewAgentsMdEmpty')}</p>
              )}
              <p className="ds-field__hint">{t('previewAgentsMdNote')}</p>
            </>
          ) : (
            <p className="ds-field__hint">{t('loading')}</p>
          )}
        </EntityViewPanel>
      ) : null}
    </>
  );
}
