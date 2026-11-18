import { Link } from 'react-router-dom';
import type { TFunction } from 'i18next';
import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import type { KnowledgeBaseResponse } from '../../../../data/knowledgeBasesApi';
import type { ApiModelResponse } from '../../../../data/modelsApi';
import { RESOURCE_TYPES } from '../../../../data/resourceAclApi';
import { ResourceSharePanel } from '../../../../components/ResourceSharePanel';
import { KbAgentSettings } from '../../../knowledge-bases/KbAgentSettings';
import './SettingsTab.scss';

type SettingsSubTab = { id: 'general' | 'agent' | 'sharing'; label: string; icon: LucideIcon };

/**
 * The knowledge base's own settings: how it is embedded and chunked, the prompt used to generate FAQs, its
 * metadata keys, and the index run.
 *
 * Three sub-tabs, because they answer three different questions — what this base *is* (general), what the
 * agent answering from it may do (agent, which is the workforce agent's half), and who may read it
 * (sharing). Keeping them as one form with sections is what made "which Save button saves what" a question.
 *
 * The form is a plain controlled form: no local draft, because the page already holds the draft and Save
 * writes it — a second copy inside the tab is how two screens end up disagreeing.
 */
export function SettingsTab({
  t,
  kbId,
  kb,
  subTabs,
  subTab,
  onSubTabChange,
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
  saving,
  onSave,
  indexJobSubmitting,
  onEnqueueIndex,
  onKbReload,
}: {
  t: TFunction;
  kbId: string;
  kb: KnowledgeBaseResponse;
  subTabs: SettingsSubTab[];
  subTab: SettingsSubTab['id'];
  onSubTabChange: (id: SettingsSubTab['id']) => void;
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
  saving: boolean;
  onSave: () => void;
  indexJobSubmitting: boolean;
  onEnqueueIndex: () => void;
  onKbReload: () => void;
}) {
  return (
    <section className="kb-section">
      <h2 id="kb-settings-heading" className="kb-settings-page-title">
        {t('detail.settingsTitle')}
      </h2>

      <div className="kb-settings-subtabs" role="tablist" aria-label={t('detail.settingsTitle')}>
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={subTab === tab.id}
            className={`kb-settings-subtab ${subTab === tab.id ? 'active' : ''}`}
            onClick={() => onSubTabChange(tab.id)}
          >
            <tab.icon size={16} aria-hidden />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="kb-settings-subtab-panel" role="tabpanel">
        {subTab === 'sharing' && kbId ? (
          <ResourceSharePanel
            resourceType={RESOURCE_TYPES.knowledgeBase}
            resourceId={kbId}
            title={t('detail.sharingTitle')}
          />
        ) : null}

        {subTab === 'agent' ? <KbAgentSettings kb={kb} onSaved={onKbReload} /> : null}

        {subTab === 'general' ? (
          <>
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
          </>
        ) : null}
      </div>
    </section>
  );
}
