import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useAsyncData } from '../../../hooks/useAsyncData';
import { fetchPromptPreview, type WorkforcePromptPreview } from '../../../data/workforceApi';
import { EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { useWorkforceDetail } from './workforceDetailContext';

/**
 * What the model is given, as the qa-agent assembles it — a view of the whole agent, not of one tab.
 *
 * This is why it is a top-level tab rather than a switch inside Profile: the prompt is composed from the profile
 * (identity, instruction, AGENTS.md), the installed skills, the enabled tools, the answer policy and the retrieved
 * passages. Each block names the tab it comes from, so "which field do I change" is answered by looking, not by
 * reading documentation. Trying to show that inside Profile implied the prompt only reflected Profile — which is how
 * the name, description and AGENTS.md were once missing from it.
 */
const EMPTY_PREVIEW: WorkforcePromptPreview = {
  system_prompt: '',
  sections: [],
  base_instruction: null,
  agents_md: null,
};

type PromptView = 'sections' | 'full';

export function WorkforcePromptTab() {
  const { t } = useTranslation('workforce');
  const { agent } = useWorkforceDetail();
  const [view, setView] = useState<PromptView>('sections');

  const sourceId = agent.knowledge_bases[0]?.knowledge_base_id ?? null;

  // `useAsyncData` exists for exactly this: it starts the request in the effect and lands the result in a promise,
  // instead of setting state synchronously while rendering.
  const { data: preview, error, reload } = useAsyncData<WorkforcePromptPreview>(
    () =>
      sourceId
        ? fetchPromptPreview(agent.id, sourceId, { systemPrompt: null, agentsMd: null })
        : Promise.resolve(EMPTY_PREVIEW),
    [agent.id, sourceId]
  );

  if (!sourceId) {
    return (
      <>
        <EntityViewHeader title={t('promptTabTitle')} subtitle={t('promptTabLead')} />
        <EntityViewPanel>
          <p className="ds-field__hint">{t('previewNeedsSource')}</p>
        </EntityViewPanel>
      </>
    );
  }

  return (
    <>
      <EntityViewHeader
        title={t('promptTabTitle')}
        subtitle={t('promptTabLead')}
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => reload()}>
            {t('promptReload')}
          </button>
        }
      />

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
        <EntityViewPanel>
          <p className="ds-field__hint page-subtitle--error">{t('previewFailed')}</p>
        </EntityViewPanel>
      ) : preview && view === 'full' ? (
        <EntityViewPanel title={t('promptFullTitle')} description={t('promptFullLead')}>
          <pre className="workforce-prompt-preview">{preview.system_prompt}</pre>
        </EntityViewPanel>
      ) : preview ? (
        <>
          {preview.sections.map((section, index) => (
            <EntityViewPanel
              key={`${section.key}-${index}`}
              title={t(`promptSection_${section.key}`)}
              description={t(`promptSource_${section.key}`)}
            >
              <pre className="workforce-prompt-preview">{section.content}</pre>
            </EntityViewPanel>
          ))}

          <EntityViewPanel title={t('promptAgentsMdTitle')} description={t('promptAgentsMdLead')}>
            {preview.agents_md ? (
              <pre className="workforce-prompt-preview">{preview.agents_md}</pre>
            ) : (
              <p className="ds-field__hint">{t('previewAgentsMdEmpty')}</p>
            )}
          </EntityViewPanel>
        </>
      ) : (
        <EntityViewPanel>
          <p className="ds-field__hint">{t('loading')}</p>
        </EntityViewPanel>
      )}
    </>
  );
}
