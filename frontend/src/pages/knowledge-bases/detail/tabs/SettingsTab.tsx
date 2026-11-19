import { Link } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { Loader2 } from 'lucide-react';
import type { KnowledgeBaseResponse } from '../../../../data/knowledgeBasesApi';
import type { ApiModelResponse } from '../../../../data/modelsApi';
import { FormField } from '../../../../styles/design-system';
import { EntityViewHeader, EntityViewPanel } from '../../../shared/EntityViewShell';
import './SettingsTab.scss';

/**
 * The knowledge base's own settings: how it is embedded and chunked, the prompt used to generate FAQs, its
 * metadata keys, and the index run.
 *
 * Sharing is its own section (`/sharing`), like every other resource — one editor per concern. How an agent
 * answers is not here either: that is the workforce agent's own screen.
 *
 * The form is a plain controlled form: no local draft, because the page already holds the draft and Save
 * writes it — a second copy inside the tab is how two screens end up disagreeing. It is written with the
 * shared `FormField` + `.entity-view__form` like every other settings page, so a field is a field here too.
 */
export function SettingsTab({
  t,
  kb,
  embeddingModels,
  embeddingModelId,
  onEmbeddingModelIdChange,
  chunkStrategy,
  onChunkStrategyChange,
  chunkSize,
  onChunkSizeChange,
  chunkOverlap,
  onChunkOverlapChange,
  faqPrompt,
  onFaqPromptChange,
  metadataKeys,
  onMetadataKeysChange,
  retrievalTopK,
  onRetrievalTopKChange,
  retrievalRerank,
  onRetrievalRerankChange,
  saving,
  onSave,
  indexJobSubmitting,
  onEnqueueIndex,
}: {
  t: TFunction;
  kb: KnowledgeBaseResponse;
  embeddingModels: ApiModelResponse[];
  embeddingModelId: string;
  onEmbeddingModelIdChange: (value: string) => void;
  chunkStrategy: string;
  onChunkStrategyChange: (value: string) => void;
  chunkSize: number;
  onChunkSizeChange: (value: number) => void;
  chunkOverlap: number;
  onChunkOverlapChange: (value: number) => void;
  faqPrompt: string;
  onFaqPromptChange: (value: string) => void;
  metadataKeys: string;
  onMetadataKeysChange: (value: string) => void;
  /** How deep the retriever goes: a property of the corpus, so it stays on the knowledge base. */
  retrievalTopK: string;
  onRetrievalTopKChange: (value: string) => void;
  retrievalRerank: boolean | null;
  onRetrievalRerankChange: (value: boolean | null) => void;
  saving: boolean;
  onSave: () => void;
  indexJobSubmitting: boolean;
  onEnqueueIndex: () => void;
}) {
  return (
    <>
      <EntityViewHeader
        title={t('detail.tabs.settings')}
        subtitle={t('detail.settingsSubtitle')}
        actions={
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? t('detail.savingSettings') : t('detail.saveSettings')}
          </button>
        }
      />

      <EntityViewPanel>
        <div className="entity-view__form">
          <FormField label={t('detail.embeddingModel')} hint={t('detail.embeddingHelp')}>
            <select
              value={embeddingModelId}
              onChange={(e) => onEmbeddingModelIdChange(e.target.value)}
            >
              <option value="">{t('detail.modelNone')}</option>
              {embeddingModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.model_name})
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </EntityViewPanel>

      <EntityViewPanel>
        <div className="entity-view__form">
          <h3>{t('detail.chunkingFieldset')}</h3>
          <FormField label={t('detail.strategy')}>
            <select
              value={chunkStrategy}
              onChange={(e) => onChunkStrategyChange(e.target.value)}
            >
              <option value="fixed_size">{t('detail.strategyFixedSize')}</option>
              <option value="markdown_header">{t('detail.strategyMarkdownHeader')}</option>
              <option value="paragraph">{t('detail.strategyParagraph')}</option>
            </select>
          </FormField>
          <FormField label={t('detail.chunkSize')}>
            <input
              type="number"
              min={100}
              max={10000}
              value={chunkSize}
              onChange={(e) => onChunkSizeChange(Number(e.target.value))}
            />
          </FormField>
          <FormField label={t('detail.chunkOverlap')}>
            <input
              type="number"
              min={0}
              max={1000}
              value={chunkOverlap}
              onChange={(e) => onChunkOverlapChange(Number(e.target.value))}
            />
          </FormField>
        </div>
      </EntityViewPanel>

      <EntityViewPanel>
        <div className="entity-view__form">
          <h3>{t('detail.retrievalFieldset')}</h3>
          <FormField label={t('detail.retrievalTopK')} hint={t('detail.retrievalTopKHelp')}>
            <input
              type="number"
              min={1}
              max={50}
              value={retrievalTopK}
              onChange={(e) => onRetrievalTopKChange(e.target.value)}
            />
          </FormField>
          <FormField label={t('detail.retrievalRerank')} hint={t('detail.retrievalRerankHelp')}>
            <select
              value={retrievalRerank === null ? 'default' : retrievalRerank ? 'on' : 'off'}
              onChange={(e) =>
                onRetrievalRerankChange(
                  e.target.value === 'default' ? null : e.target.value === 'on'
                )
              }
            >
              <option value="default">{t('detail.retrievalRerankDefault')}</option>
              <option value="on">{t('detail.retrievalRerankOn')}</option>
              <option value="off">{t('detail.retrievalRerankOff')}</option>
            </select>
          </FormField>
        </div>
      </EntityViewPanel>

      <EntityViewPanel>
        <div className="entity-view__form">
          <FormField label={t('detail.faqGenPrompt')} hint={t('detail.faqGenPromptHelp')}>
            <textarea
              rows={6}
              placeholder={t('detail.faqGenPromptPlaceholder')}
              value={faqPrompt}
              onChange={(e) => onFaqPromptChange(e.target.value)}
            />
          </FormField>
          <FormField label={t('detail.metadataKeys')} hint={t('detail.metadataKeysHelp')}>
            <input
              type="text"
              placeholder={t('detail.metadataKeysPlaceholder')}
              value={metadataKeys}
              onChange={(e) => onMetadataKeysChange(e.target.value)}
            />
          </FormField>
        </div>
      </EntityViewPanel>

      <EntityViewPanel>
        <div className="entity-view__form">
          <h3>{t('detail.indexJobTitle')}</h3>
          <p className="ds-field__hint">{t('detail.indexJobHelp')}</p>
          <div className="openkms-flex-row-gap">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={indexJobSubmitting || !kb.embedding_model_id}
              onClick={onEnqueueIndex}
            >
              {indexJobSubmitting ? (
                <>
                  <Loader2 size={14} className="kb-spinner-inline" aria-hidden />
                  {t('detail.indexJobButtonRunning')}
                </>
              ) : (
                t('detail.indexJobButton')
              )}
            </button>
            <Link to="/job-runs" className="btn btn-secondary">
              {t('detail.indexJobViewJobs')}
            </Link>
          </div>
          {!kb.embedding_model_id ? (
            <p className="ds-field__hint">{t('detail.indexJobRequiresEmbedding')}</p>
          ) : null}
        </div>
      </EntityViewPanel>
    </>
  );
}
