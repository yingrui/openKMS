import { Link } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { Loader2 } from 'lucide-react';
import type { KnowledgeBaseResponse } from '../../../../data/knowledgeBasesApi';
import type { ApiModelResponse } from '../../../../data/modelsApi';
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
 * writes it — a second copy inside the tab is how two screens end up disagreeing.
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
        title={t('detail.settingsTitle')}
        subtitle={t('detail.settingsSubtitle')}
      />
      <EntityViewPanel>
      <div className="kb-settings-header-row">
        <p className="kb-settings-general-lead">{t('detail.settingsGeneralLead')}</p>
        <button
          type="button"
          className="btn btn-primary kb-settings-header-save"
          disabled={saving}
          onClick={onSave}
        >
          {saving ? t('detail.savingSettings') : t('detail.saveSettings')}
        </button>
      </div>

      <div className="kb-settings-form">
        <div className="kb-settings-layout">
          <div className="kb-settings-col">
            <label>
              <span>{t('detail.embeddingModel')}</span>
              <select
                value={embeddingModelId}
                onChange={(e) => onEmbeddingModelIdChange(e.target.value)}
                className="ds-control"
              >
                <option value="">{t('detail.modelNone')}</option>
                {embeddingModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.model_name})
                  </option>
                ))}
              </select>
              <small>{t('detail.embeddingHelp')}</small>
            </label>

            <fieldset className="kb-settings-fieldset">
              <legend>{t('detail.chunkingFieldset')}</legend>
              <label>
                <span>{t('detail.strategy')}</span>
                <select
                  value={chunkStrategy}
                  onChange={(e) => onChunkStrategyChange(e.target.value)}
                  className="ds-control"
                >
                  <option value="fixed_size">{t('detail.strategyFixedSize')}</option>
                  <option value="markdown_header">{t('detail.strategyMarkdownHeader')}</option>
                  <option value="paragraph">{t('detail.strategyParagraph')}</option>
                </select>
              </label>
              <label>
                <span>{t('detail.chunkSize')}</span>
                <input
                  type="number"
                  min={100}
                  max={10000}
                  value={chunkSize}
                  onChange={(e) => onChunkSizeChange(Number(e.target.value))}
                  className="ds-control"
                />
              </label>
              <label>
                <span>{t('detail.chunkOverlap')}</span>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={chunkOverlap}
                  onChange={(e) => onChunkOverlapChange(Number(e.target.value))}
                  className="ds-control"
                />
              </label>
            </fieldset>

            <fieldset className="kb-settings-fieldset">
              <legend>{t('detail.retrievalFieldset')}</legend>
              <label>
                <span>{t('detail.retrievalTopK')}</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={retrievalTopK}
                  onChange={(e) => onRetrievalTopKChange(e.target.value)}
                  className="ds-control"
                />
                <small>{t('detail.retrievalTopKHelp')}</small>
              </label>
              <label>
                <span>{t('detail.retrievalRerank')}</span>
                <select
                  value={retrievalRerank === null ? 'default' : retrievalRerank ? 'on' : 'off'}
                  onChange={(e) =>
                    onRetrievalRerankChange(
                      e.target.value === 'default' ? null : e.target.value === 'on'
                    )
                  }
                  className="ds-control"
                >
                  <option value="default">{t('detail.retrievalRerankDefault')}</option>
                  <option value="on">{t('detail.retrievalRerankOn')}</option>
                  <option value="off">{t('detail.retrievalRerankOff')}</option>
                </select>
                <small>{t('detail.retrievalRerankHelp')}</small>
              </label>
            </fieldset>
          </div>

          <div className="kb-settings-col kb-settings-col-text">
            <label>
              <span>{t('detail.faqGenPrompt')}</span>
              <textarea
                className="ds-control"
                placeholder={t('detail.faqGenPromptPlaceholder')}
                value={faqPrompt}
                onChange={(e) => onFaqPromptChange(e.target.value)}
                rows={6}
              />
              <small>{t('detail.faqGenPromptHelp')}</small>
            </label>

            <label>
              <span>{t('detail.metadataKeys')}</span>
              <input
                type="text"
                placeholder={t('detail.metadataKeysPlaceholder')}
                value={metadataKeys}
                onChange={(e) => onMetadataKeysChange(e.target.value)}
                className="ds-control"
              />
              <small>{t('detail.metadataKeysHelp')}</small>
            </label>
          </div>
        </div>

        <fieldset className="kb-settings-fieldset kb-settings-index-fieldset">
          <legend>{t('detail.indexJobTitle')}</legend>
          <div className="kb-settings-index-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={indexJobSubmitting || !kb.embedding_model_id}
              onClick={onEnqueueIndex}
            >
              {indexJobSubmitting ? (
                <>
                  <Loader2 size={14} className="kb-spinner-inline" />
                  {t('detail.indexJobButtonRunning')}
                </>
              ) : (
                t('detail.indexJobButton')
              )}
            </button>
            <Link to="/job-runs" className="kb-settings-index-jobs-link">
              {t('detail.indexJobViewJobs')}
            </Link>
          </div>
          <small className="kb-settings-index-help">{t('detail.indexJobHelp')}</small>
          {!kb.embedding_model_id ? (
            <small className="kb-settings-index-warn">{t('detail.indexJobRequiresEmbedding')}</small>
          ) : null}
        </fieldset>
      </div>
      </EntityViewPanel>
    </>
  );
}
