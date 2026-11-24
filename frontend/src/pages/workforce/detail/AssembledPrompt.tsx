import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useAsyncData } from '../../../hooks/useAsyncData';
import { fetchPromptPreview, type WorkforcePromptPreview } from '../../../data/workforceApi';
import { useWorkforceDetail } from './workforceDetailContext';

/**
 * What the model is given, as the qa-agent assembles it — a view of the whole agent, not of one tab.
 *
 * It is composed from the profile (identity, instruction, AGENTS.md), the installed skills, the enabled tools, the
 * answer policy and the retrieved passages, so it lives on Profile as a collapsed panel: the three fields that start
 * it are on the same page, and every block is labelled with the tab it comes from — the label is what keeps "this is
 * the whole agent" from reading as "this is Profile".
 */
const EMPTY_PREVIEW: WorkforcePromptPreview = {
  system_prompt: '',
  sections: [],
  base_instruction: null,
  agents_md: null,
};

type PromptView = 'sections' | 'full';

export function AssembledPrompt({
  systemPrompt,
  agentsMd,
}: {
  /** The text on screen, unsaved included: the endpoint previews what it is given, which is the point of a preview. */
  systemPrompt?: string;
  agentsMd?: string;
} = {}) {
  const { t } = useTranslation('workforce');
  const { agent } = useWorkforceDetail();
  const [view, setView] = useState<PromptView>('sections');

  const sourceId = agent.knowledge_bases[0]?.knowledge_base_id ?? null;

  // `useAsyncData` exists for exactly this: it starts the request in the effect and lands the result in a promise,
  // instead of setting state synchronously while rendering.
  const { data: preview, error } = useAsyncData<WorkforcePromptPreview>(
    () =>
      sourceId
        ? fetchPromptPreview(agent.id, sourceId, {
            systemPrompt: systemPrompt ?? null,
            agentsMd: agentsMd ?? null,
          })
        : Promise.resolve(EMPTY_PREVIEW),
    [agent.id, sourceId, systemPrompt, agentsMd]
  );

  if (!sourceId) {
    return <p className="ds-field__hint">{t('previewNeedsSource')}</p>;
  }

  return (
    <>
      {/* Two renderings of the same text: grouped by owner (which tab to change), or verbatim (what is actually
          sent, for copying and for checking order and blank lines). AGENTS.md is a block, not a third rendering. */}
      <div className="workforce-view-switch">
        <div className="ds-view-toggle" role="group" aria-label={t('promptTabTitle')}>
          <button
            type="button"
            className={`ds-view-toggle__btn${view === 'sections' ? ' active' : ''}`}
            aria-pressed={view === 'sections'}
            onClick={() => setView('sections')}
          >
            {t('promptViewSections')}
          </button>
          <button
            type="button"
            className={`ds-view-toggle__btn${view === 'full' ? ' active' : ''}`}
            aria-pressed={view === 'full'}
            onClick={() => setView('full')}
          >
            {t('promptViewFull')}
          </button>
        </div>
        {view === 'full' && preview ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              void navigator.clipboard.writeText(preview.system_prompt);
              toast.success(t('copied'));
            }}
          >
            <Copy size={14} aria-hidden />
            {t('promptCopy')}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="ds-field__hint page-subtitle--error">{t('previewFailed')}</p>
      ) : preview && view === 'full' ? (
        <div className="workforce-prompt-block">
          <div className="workforce-prompt-block__head">
            <span className="workforce-prompt-block__label">{t('promptFullTitle')}</span>
            <span className="workforce-prompt-block__note">{t('promptFullLead')}</span>
          </div>
          <pre className="workforce-prompt-preview">{preview.system_prompt}</pre>
        </div>
      ) : preview ? (
        <>
          {preview.sections.map((section, index) => (
            <div key={`${section.key}-${index}`} className="workforce-prompt-block">
              <div className="workforce-prompt-block__head">
                <span className="workforce-prompt-block__label">
                  {t(`promptSection_${section.key}`)}
                </span>
                <span className="workforce-prompt-block__note">
                  {t(`promptSource_${section.key}`)}
                </span>
              </div>
              <pre className="workforce-prompt-preview">{section.content}</pre>
            </div>
          ))}

          <div className="workforce-prompt-block">
            <div className="workforce-prompt-block__head">
              <span className="workforce-prompt-block__label">{t('promptAgentsMdTitle')}</span>
              <span className="workforce-prompt-block__note">{t('promptAgentsMdLead')}</span>
            </div>
            {preview.agents_md ? (
              <pre className="workforce-prompt-preview">{preview.agents_md}</pre>
            ) : (
              <p className="ds-field__hint">{t('previewAgentsMdEmpty')}</p>
            )}
          </div>
        </>
      ) : (
        <p className="ds-field__hint">{t('loading')}</p>
      )}
    </>
  );
}
