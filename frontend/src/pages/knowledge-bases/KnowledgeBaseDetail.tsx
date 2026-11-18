import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  MessageSquare,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { ResourceSharePanel } from '../../components/ResourceSharePanel';
import { RESOURCE_TYPES } from '../../data/resourceAclApi';
import {
  KbChunkDialog,
  KbDocPickerDialog,
  KbFaqDialog,
  KbGenerateFaqDialog,
  KbWikiSpacePickerDialog,
} from './KnowledgeBaseDetail.dialogs';
import { KbAgentSettings } from './KbAgentSettings';
import { TAB_ICONS, TAB_ORDER } from './KnowledgeBaseDetail.types';
import { useKnowledgeBaseDetail } from './useKnowledgeBaseDetail';
import { DocumentsTab } from './detail/tabs/DocumentsTab';
import { WikiSpacesTab } from './detail/tabs/WikiSpacesTab';
import { DataScopeTab } from './detail/tabs/DataScopeTab';
import { FaqsTab } from './detail/tabs/FaqsTab';
import { ChunksTab } from './detail/tabs/ChunksTab';
import { SearchTab } from './detail/tabs/SearchTab';
import { metadataArrayFlags } from './detail/faqMetadata';
import type { FAQResponse } from '../../data/knowledgeBasesApi';
import { ContentCommentsShell } from '../../components/comments/ContentCommentsShell';
import './KnowledgeBaseDetail.scss';
import '../workforce/chat/KbQaChat.scss';

export function KnowledgeBaseDetail() {
  const {
    loadKb,
    kbId,   channels, t, kb,  activeTab, setActiveTab, loading, docs, docTotal, docPage, setDocPage, docPageSize, setDocPageSize,
      genDocs,  showDocPicker,  pickerSearch,
     pickerResults,  pickerLoading, pickerSelected, 
    pickerSelectedChannel,  pickerChannelExpanded, 
      pickerPage, setPickerPage, pickerPageSize,
    pickerTotal,  pickerAdding,  kbWikiSpaces,
    kbSemanticModels, kbOntologyGroups, allSemanticModels, allOntologyGroups, scopeBusyId,
    showWikiSpacePicker,  wikiSpacePickerItems, 
    wikiSpacePickerLoading,  wikiSpaceBusyId,  faqs,
    faqTotal, faqPage, setFaqPage, faqPageSize, setFaqPageSize, showFaqDialog, setShowFaqDialog,
    faqDialogSource, setFaqDialogSource, faqPolishing,  editFaq, setEditFaq,
    faqQuestion, setFaqQuestion, faqAnswer, setFaqAnswer, setFaqLabelsValues, faqDocMetadataValues,
    setFaqDocMetadataValues, setFaqLabelAllowMultiple, faqMetadataIsArray, setFaqMetadataIsArray,
    showGenerateModal,  genSelectedDocs, setGenSelectedDocs, genModelId,
    setGenModelId, genPrompt, setGenPrompt, generating,  genProgress, 
    genStep,  genPreviewFaqs,  genSaving,  chunks,
    chunkTotal, chunkPage, setChunkPage, chunkPageSize, setChunkPageSize, editChunk, 
    showChunkDialog,  chunkContent, setChunkContent, 
    chunkDocMetadataValues, setChunkDocMetadataValues,  chunkMetadataIsArray,
     chunkSaving,  chunkDialogReadOnly, 
    searchQuery, setSearchQuery, searchType, setSearchType, searchResults, 
    searching,  hasSearched,  searchOptionsExpanded, setSearchOptionsExpanded,
    searchLabelFilters, searchMetadataFilters, setSearchMetadataFilters, searchTopK, setSearchTopK,
    searchForceDense, setSearchForceDense, searchRetrievalDiff,  settingsEmbeddingModelId, setSettingsEmbeddingModelId, settingsFaqPrompt, setSettingsFaqPrompt,
    settingsChunkStrategy, setSettingsChunkStrategy, settingsChunkSize, setSettingsChunkSize,
    settingsChunkOverlap, setSettingsChunkOverlap, settingsMetadataKeys, setSettingsMetadataKeys,
    embeddingModels, llmModels, settingsSaving,  settingsSubTab, setSettingsSubTab,
    indexJobSubmitting,  settingsSubTabs,   
        enqueueIndexJob, 
    alreadyAddedIds,
    openDocPicker, closeDocPicker,  handlePickerSearch, handlePickerChannelSelect,
    handlePickerChannelToggle, handleAddSelectedDocuments, handleRemoveDocument, togglePickerDoc,
    pickerTotalPages, openWikiSpacePicker, closeWikiSpacePicker, handleAddWikiSpaceToKb, handleRemoveWikiSpaceFromKb,
    handleAddSemanticModelToKb, handleRemoveSemanticModelFromKb,
    handleAddOntologyGroupToKb, handleRemoveOntologyGroupFromKb,
    handleIndexWikiSpace, closeFaqDialog, handlePolishFaqAnswer, handleSaveFaq,
    handleDeleteFaq, openGenerateModal, closeGenerateModal, handleGenerateFaqs, handleSaveGeneratedFaqs,
    handleGenBackToConfig, openChunkEdit, openChunkViewFromId, openChunkEditFromId, closeChunkDialog,
    handleSaveChunk, handleSearch, handleSaveSettings,
     objToConfigValues, pickerCanPrev, pickerCanNext, toggleGenDoc, removeGenPreviewFaq,
  } = useKnowledgeBaseDetail();
  if (loading) return <div className="kb-detail"><p>{t('detail.loading')}</p></div>;
  if (!kb) return <div className="kb-detail"><p>{t('detail.notFound')}</p></div>;

  const faqDialog = (
    <KbFaqDialog
      show={showFaqDialog}
      editFaq={editFaq}
      faqDialogSource={faqDialogSource}
      faqPolishing={faqPolishing}
      onClose={closeFaqDialog}
      faqQuestion={faqQuestion}
      onFaqQuestionChange={setFaqQuestion}
      faqAnswer={faqAnswer}
      onFaqAnswerChange={setFaqAnswer}
      onPolishFaqAnswer={() => void handlePolishFaqAnswer()}
      metadataKeys={kb.metadata_keys}
      faqMetadataIsArray={faqMetadataIsArray}
      faqDocMetadataValues={faqDocMetadataValues}
      onFaqDocMetadataValuesChange={setFaqDocMetadataValues}
      onSaveFaq={handleSaveFaq}
    />
  );

  /** New FAQ: empty fields, with the KB's metadata keys laid out for the dialog. */
  const openAddFaq = () => {
    setEditFaq(null);
    setFaqDialogSource('manual');
    setFaqQuestion('');
    setFaqAnswer('');
    setFaqLabelsValues(objToConfigValues({}, kb.metadata_keys ?? undefined));
    setFaqDocMetadataValues(objToConfigValues({}, kb.metadata_keys ?? undefined));
    setFaqLabelAllowMultiple({});
    setFaqMetadataIsArray({});
    setShowFaqDialog(true);
  };

  /** Edit FAQ: load its metadata, and ask the document's channel which keys are lists for this document. */
  const openEditFaq = async (faq: FAQResponse) => {
    setEditFaq(faq);
    setFaqDialogSource('manual');
    setFaqQuestion(faq.question);
    setFaqAnswer(faq.answer);
    const metaValues = objToConfigValues(faq.doc_metadata, kb.metadata_keys ?? undefined);
    setFaqLabelsValues(metaValues);
    setFaqDocMetadataValues(metaValues);
    setFaqLabelAllowMultiple({});
    setFaqMetadataIsArray(await metadataArrayFlags(faq.document_id, kb.metadata_keys));
    setShowFaqDialog(true);
  };

  return (
    <ContentCommentsShell resourceType="knowledge_base" resourceId={kb.id}>
    <div className="kb-detail">
      <Link to="/knowledge-bases" className="kb-detail-back" aria-label={t('detail.backToList')}>
        <ArrowLeft size={18} />
        <span className="ds-compact-label">{t('detail.backToList')}</span>
      </Link>

      <header className="kb-detail-header kb-detail-header--split">
        <div className="kb-detail-header-text">
          <h1>{kb.name}</h1>
          <p className="kb-detail-desc">{kb.description || t('detail.noDescription')}</p>
          <div className="kb-detail-stats">
            <span>{t('detail.statDocs', { count: kb.document_count })}</span>
            <span>{t('detail.statWikiSpaces', { count: kb.wiki_space_count ?? 0 })}</span>
            <span>{t('detail.statFaqs', { count: kb.faq_count })}</span>
            <span>{t('detail.statChunks', { count: kb.chunk_count })}</span>
          </div>
        </div>
        <div className="kb-detail-header-actions">
          {kb.embedding_model_id ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm kb-detail-header-index-btn"
              onClick={() => void enqueueIndexJob()}
              disabled={indexJobSubmitting}
              title={t('detail.indexJobHeaderTitle')}
              aria-label={t('detail.indexJobHeader')}
            >
              {indexJobSubmitting ? (
                <Loader2 size={18} className="kb-spinner-inline" aria-hidden />
              ) : (
                <RefreshCw size={18} aria-hidden />
              )}
              <span className="ds-compact-label">{t('detail.indexJobHeader')}</span>
            </button>
          ) : null}
        {kb.qa_available && kb.default_agent_id ? (
          /* The conversation is a workforce screen; this is only the way in from the corpus it answers about. */
          <Link
            className="btn btn-primary btn-sm kb-detail-header-qa-btn"
            to={`/workforce/${kb.default_agent_id}/chat?kb=${encodeURIComponent(kb.id)}`}
            aria-label={t('detail.qaOpenChat')}
          >
            <MessageSquare size={18} aria-hidden />
            <span className="ds-compact-label">{t('detail.qaOpenChat')}</span>
          </Link>
        ) : null}
        </div>
      </header>

      <div className="kb-detail-tabs">
        {TAB_ORDER.map((tabId) => {
          const Icon = TAB_ICONS[tabId];
          const label = t(`detail.tabs.${tabId}`);
          return (
            <button
              key={tabId}
              type="button"
              className={`kb-tab ${activeTab === tabId ? 'active' : ''}`}
              onClick={() => setActiveTab(tabId)}
              aria-label={label}
            >
              <Icon size={18} aria-hidden />
              <span className="ds-compact-label">{label}</span>
            </button>
          );
        })}
      </div>

      <div className="kb-detail-content">
        {/* ===== DOCUMENTS TAB ===== */}
        {activeTab === 'documents' && (
          <DocumentsTab
            t={t}
            docs={docs}
            docTotal={docTotal}
            docPage={docPage}
            docPageSize={docPageSize}
            onPageChange={setDocPage}
            onPageSizeChange={setDocPageSize}
            onAdd={openDocPicker}
            onRemove={handleRemoveDocument}
          />
        )}

        {/* ===== WIKI SPACES TAB ===== */}
        {activeTab === 'wiki_spaces' && (
          <WikiSpacesTab
            t={t}
            spaces={kbWikiSpaces}
            hasEmbeddingModel={Boolean(kb.embedding_model_id)}
            busyId={wikiSpaceBusyId}
            onAdd={() => void openWikiSpacePicker()}
            onIndex={(id) => void handleIndexWikiSpace(id)}
            onRemove={(id) => void handleRemoveWikiSpaceFromKb(id)}
          />
        )}

        {/* ===== DATA SCOPE TAB ===== */}
        {activeTab === 'data_scope' && (
          <DataScopeTab
            t={t}
            semanticModels={kbSemanticModels}
            ontologyGroups={kbOntologyGroups}
            allSemanticModels={allSemanticModels}
            allOntologyGroups={allOntologyGroups}
            busyId={scopeBusyId}
            onAddSemanticModel={(id) => void handleAddSemanticModelToKb(id)}
            onRemoveSemanticModel={(id) => void handleRemoveSemanticModelFromKb(id)}
            onAddOntologyGroup={(id) => void handleAddOntologyGroupToKb(id)}
            onRemoveOntologyGroup={(id) => void handleRemoveOntologyGroupFromKb(id)}
          />
        )}

        {/* ===== FAQS TAB ===== */}
        {activeTab === 'faqs' && (
          <FaqsTab
            t={t}
            faqs={faqs}
            total={faqTotal}
            page={faqPage}
            pageSize={faqPageSize}
            onPageChange={setFaqPage}
            onPageSizeChange={setFaqPageSize}
            onGenerate={() => void openGenerateModal()}
            onAdd={openAddFaq}
            onEdit={(faq) => void openEditFaq(faq)}
            onDelete={(id) => void handleDeleteFaq(id)}
          />
        )}

        {/* ===== CHUNKS TAB ===== */}
        {activeTab === 'chunks' && (
          <ChunksTab
            t={t}
            chunks={chunks}
            total={chunkTotal}
            page={chunkPage}
            pageSize={chunkPageSize}
            onPageChange={setChunkPage}
            onPageSizeChange={setChunkPageSize}
            onEdit={openChunkEdit}
          />
        )}

        {/* ===== SEARCH TAB ===== */}
        {activeTab === 'search' && (
          <SearchTab
            t={t}
            query={searchQuery}
            onQueryChange={setSearchQuery}
            searchType={searchType}
            onSearchTypeChange={setSearchType}
            onSubmit={handleSearch}
            searching={searching}
            results={searchResults}
            hasSearched={hasSearched}
            optionsOpen={searchOptionsExpanded}
            onToggleOptions={() => setSearchOptionsExpanded((o) => !o)}
            activeFilterCount={
              [
                Object.values(searchLabelFilters).some(Boolean),
                Object.values(searchMetadataFilters).some(Boolean),
                searchForceDense,
                searchTopK !== 10,
              ].filter(Boolean).length
            }
            topK={searchTopK}
            onTopKChange={setSearchTopK}
            forceDense={searchForceDense}
            onForceDenseChange={setSearchForceDense}
            metadataKeys={kb.metadata_keys}
            metadataFilters={searchMetadataFilters}
            onMetadataFilterChange={(key, value) =>
              setSearchMetadataFilters((prev) => ({ ...prev, [key]: value }))
            }
            retrievalDiff={searchRetrievalDiff}
            onChunkView={(id) => void openChunkViewFromId(id)}
            onChunkEdit={(id) => void openChunkEditFromId(id)}
          />
        )}

        {/* ===== SETTINGS TAB ===== */}
        {activeTab === 'settings' && (
          <section className="kb-section">
            <h2 id="kb-settings-heading" className="kb-settings-page-title">
              {t('detail.settingsTitle')}
            </h2>

            <div className="kb-settings-subtabs" role="tablist" aria-label={t('detail.settingsTitle')}>
              {settingsSubTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={settingsSubTab === tab.id}
                  className={`kb-settings-subtab ${settingsSubTab === tab.id ? 'active' : ''}`}
                  onClick={() => setSettingsSubTab(tab.id)}
                >
                  <tab.icon size={16} aria-hidden />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="kb-settings-subtab-panel" role="tabpanel">
              {settingsSubTab === 'sharing' && kbId ? (
                <ResourceSharePanel
                  resourceType={RESOURCE_TYPES.knowledgeBase}
                  resourceId={kbId}
                  title={t('detail.sharingTitle')}
                />
              ) : null}

              {settingsSubTab === 'agent' && kb ? (
                <KbAgentSettings kb={kb} onSaved={loadKb} />
              ) : null}

              {settingsSubTab === 'general' ? (
                <>
            <div className="kb-settings-header-row">
              <p className="kb-settings-general-lead">{t('detail.settingsGeneralLead')}</p>
              <button
                type="button"
                className="btn btn-primary kb-settings-header-save"
                disabled={settingsSaving}
                onClick={handleSaveSettings}
              >
                {settingsSaving ? t('detail.savingSettings') : t('detail.saveSettings')}
              </button>
            </div>

            <div className="kb-settings-form">
              <div className="kb-settings-layout">
                <div className="kb-settings-col">
                  <label>
                    <span>{t('detail.embeddingModel')}</span>
                    <select value={settingsEmbeddingModelId} onChange={(e) => setSettingsEmbeddingModelId(e.target.value)} className="ds-control">
                      <option value="">{t('detail.modelNone')}</option>
                      {embeddingModels.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} ({m.model_name})</option>
                      ))}
                    </select>
                    <small>{t('detail.embeddingHelp')}</small>
                  </label>

                  <fieldset className="kb-settings-fieldset">
                    <legend>{t('detail.chunkingFieldset')}</legend>
                    <label>
                      <span>{t('detail.strategy')}</span>
                      <select value={settingsChunkStrategy} onChange={(e) => setSettingsChunkStrategy(e.target.value)} className="ds-control">
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
                        value={settingsChunkSize}
                        onChange={(e) => setSettingsChunkSize(Number(e.target.value))}
                        className="ds-control"
                      />
                    </label>
                    <label>
                      <span>{t('detail.chunkOverlap')}</span>
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        value={settingsChunkOverlap}
                        onChange={(e) => setSettingsChunkOverlap(Number(e.target.value))}
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
                      value={settingsFaqPrompt}
                      onChange={(e) => setSettingsFaqPrompt(e.target.value)}
                      rows={6}
                    />
                    <small>{t('detail.faqGenPromptHelp')}</small>
                  </label>

                  <label>
                    <span>{t('detail.metadataKeys')}</span>
                    <input
                      type="text"
                      placeholder={t('detail.metadataKeysPlaceholder')}
                      value={settingsMetadataKeys}
                      onChange={(e) => setSettingsMetadataKeys(e.target.value)}
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
                    disabled={indexJobSubmitting || !kb?.embedding_model_id}
                    onClick={() => void enqueueIndexJob()}
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
                {!kb?.embedding_model_id ? (
                  <small className="kb-settings-index-warn">{t('detail.indexJobRequiresEmbedding')}</small>
                ) : null}
              </fieldset>
            </div>
                </>
              ) : null}
            </div>
          </section>
        )}
      </div>

      <KbGenerateFaqDialog
        show={showGenerateModal}
        genStep={genStep}
        onClose={closeGenerateModal}
        generating={generating}
        genSaving={genSaving}
        genProgress={genProgress}
        genModelId={genModelId}
        onGenModelIdChange={setGenModelId}
        llmModels={llmModels}
        genPrompt={genPrompt}
        onGenPromptChange={setGenPrompt}
        genDocs={genDocs}
        genSelectedDocs={genSelectedDocs}
        onGenSelectedDocsChange={setGenSelectedDocs}
        onToggleGenDoc={toggleGenDoc}
        genPreviewFaqs={genPreviewFaqs}
        onRemoveGenPreviewFaq={removeGenPreviewFaq}
        onGenerateFaqs={() => void handleGenerateFaqs()}
        onGenBackToConfig={handleGenBackToConfig}
        onSaveGeneratedFaqs={() => void handleSaveGeneratedFaqs()}
      />

      <KbDocPickerDialog
        show={showDocPicker}
        onClose={closeDocPicker}
        pickerAdding={pickerAdding}
        channels={channels}
        pickerSelectedChannel={pickerSelectedChannel}
        pickerChannelExpanded={pickerChannelExpanded}
        onPickerChannelSelect={handlePickerChannelSelect}
        onPickerChannelToggle={handlePickerChannelToggle}
        pickerSearch={pickerSearch}
        onPickerSearch={handlePickerSearch}
        pickerLoading={pickerLoading}
        pickerResults={pickerResults}
        alreadyAddedIds={alreadyAddedIds}
        pickerSelected={pickerSelected}
        onTogglePickerDoc={togglePickerDoc}
        pickerTotal={pickerTotal}
        pickerPage={pickerPage}
        pickerPageSize={pickerPageSize}
        onPickerPageChange={setPickerPage}
        pickerCanPrev={pickerCanPrev}
        pickerCanNext={pickerCanNext}
        pickerTotalPages={pickerTotalPages}
        onAddSelectedDocuments={() => void handleAddSelectedDocuments()}
      />

      <KbWikiSpacePickerDialog
        show={showWikiSpacePicker}
        onClose={closeWikiSpacePicker}
        wikiSpacePickerLoading={wikiSpacePickerLoading}
        wikiSpacePickerItems={wikiSpacePickerItems}
        kbWikiSpaces={kbWikiSpaces}
        wikiSpaceBusyId={wikiSpaceBusyId}
        onAddWikiSpaceToKb={(id) => void handleAddWikiSpaceToKb(id)}
      />

      <KbChunkDialog
        show={showChunkDialog}
        editChunk={editChunk}
        onClose={closeChunkDialog}
        chunkSaving={chunkSaving}
        chunkContent={chunkContent}
        onChunkContentChange={setChunkContent}
        chunkDialogReadOnly={chunkDialogReadOnly}
        metadataKeys={kb?.metadata_keys}
        chunkMetadataIsArray={chunkMetadataIsArray}
        chunkDocMetadataValues={chunkDocMetadataValues}
        onChunkDocMetadataValuesChange={setChunkDocMetadataValues}
        onSaveChunk={() => void handleSaveChunk()}
      />

      {faqDialog}
    </div>
    </ContentCommentsShell>
  );
}

