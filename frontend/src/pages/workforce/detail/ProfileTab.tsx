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

/** The same cap the backend validates against. */
const MAX_CHARS = 20_000;

/**
 * Who the service is, and the two texts that shape how it answers.
 *
 * The two texts are separate inputs because they are separate things, and they are laid out as full-width editors
 * rather than a 560px form column: both are prose that is read and compared line by line, and a narrow box makes that
 * impossible.
 *
 * - **Instruction** is the body of the system prompt. Sent with every answer.
 * - **AGENTS.md** is agent memory: appended to the same system message inside `<workspace_conventions>` and written to
 *   the session workspace as a file the tools can read.
 *
 * What is *not* here: the enabled tools, the answer policy and the retrieved passages. Those are assembled by the
 * runtime so that a prompt edit cannot remove a behaviour another tab enforces.
 */
export function WorkforceProfileTab() {
  const { t } = useTranslation('workforce');
  const confirm = useConfirm();
  const { agent, reload } = useWorkforceDetail();
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? '');
  const [instruction, setInstruction] = useState(agent.agent_config?.prompts?.system_prompt ?? '');
  const [agentsMd, setAgentsMd] = useState(agent.agent_config?.prompts?.agents_md ?? '');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<WorkforcePromptPreview | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const sourceId = agent.knowledge_bases[0]?.knowledge_base_id ?? null;

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
      setPreview(null);
      toast.success(t('saved'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

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

  /** Shared footer for the two editors: how full they are, against the cap the API enforces. */
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
              disabled={saving || instruction.length > MAX_CHARS || agentsMd.length > MAX_CHARS}
              onClick={() => void save()}
            >
              <Save size={16} aria-hidden />
              {saving ? t('saving') : t('save')}
            </button>
          </>
        }
      />

      <EntityViewPanel title={t('identityTitle')}>
        <div className="workforce-identity">
          <EntityViewField label={t('name')}>
            <input className="ds-control" value={name} onChange={(e) => setName(e.target.value)} />
          </EntityViewField>
          <EntityViewField label={t('description')}>
            <textarea
              className="ds-control"
              rows={2}
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

      {previewVisible ? (
        <EntityViewPanel title={t('previewTitle')} description={t('previewLegend')}>
          {previewError ? (
            <p className="ds-field__hint page-subtitle--error">{previewError}</p>
          ) : preview ? (
            <>
              <h3 className="ds-compact-label">{t('previewSystemPrompt')}</h3>
              <pre className="workforce-prompt-preview">{preview.system_prompt}</pre>
              <h3 className="ds-compact-label">{t('previewAgentsMd')}</h3>
              {preview.agents_md ? (
                <pre className="workforce-prompt-preview">{preview.agents_md}</pre>
              ) : (
                <p className="ds-field__hint">{t('previewAgentsMdEmpty')}</p>
              )}
            </>
          ) : (
            <p className="ds-field__hint">{t('loading')}</p>
          )}
        </EntityViewPanel>
      ) : null}
    </>
  );
}
