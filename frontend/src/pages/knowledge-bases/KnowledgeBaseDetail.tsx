import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  HelpCircle,
  Search as SearchIcon,
  Send,
  FileStack,
  Layers,
  Plus,
  Eye,
  Trash2,
  Sparkles,
  MessageSquare,
  Pencil,
  Loader2,
  Filter,
  ChevronDown,
  ArrowUp,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { fetchDocumentById } from '../../data/documentsApi';
import { fetchChannelById } from '../../data/channelsApi';
import { normalizeExtractionSchemaToFields } from '../../data/channelUtils';
import { ResourceSharePanel } from '../../components/ResourceSharePanel';
import { RESOURCE_TYPES } from '../../data/resourceAclApi';
import { AgentAssistantStreamBody } from '../../components/agents/AgentAssistantStreamBody';
import { KbQaSessionSidebar } from '../../components/knowledge-bases/KbQaSessionSidebar';
import { AgentMessageBody } from '../../components/agents/AgentMessageBody';
import { KbRetrievalProvenancePanel } from './KbRetrievalProvenancePanel';
import {
  KbChunkDialog,
  KbDocPickerDialog,
  KbFaqDialog,
  KbGenerateFaqDialog,
  KbWikiSpacePickerDialog,
} from './KnowledgeBaseDetail.dialogs';
import {
  kbQaChipTitle,
  kbQaExpandedDetailPreviewMaxLen,
  kbQaFeedbackKey,
  kbQaNormalizeSourceKind,
  kbQaShowRetrievalScore,
  kbQaSourceCardModifierClass,
  kbQaSourceChipModifierClass,
  kbQaTruncatePreview,
} from './KnowledgeBaseDetail.qaUtils';
import { TAB_ICONS, TAB_ORDER } from './KnowledgeBaseDetail.types';
import { useKnowledgeBaseDetail } from './useKnowledgeBaseDetail';
import { ContentCommentsShell } from '../../components/comments/ContentCommentsShell';
import { PanelToolbar } from '../../styles/design-system';
import { useIsMobile } from '../../hooks/useIsMobile';
import './KnowledgeBaseDetail.scss';

export function KnowledgeBaseDetail() {
  const {
    kbId,   channels, t, kb,  activeTab, setActiveTab, qaFullPage,
    setQaFullPage, loading, docs, docTotal, docPage, setDocPage, docPageSize, setDocPageSize,
      genDocs,  showDocPicker,  pickerSearch,
     pickerResults,  pickerLoading, pickerSelected, 
    pickerSelectedChannel,  pickerChannelExpanded, 
      pickerPage, setPickerPage, pickerPageSize,
    pickerTotal,  pickerAdding,  kbWikiSpaces, 
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
    searchForceDense, setSearchForceDense, searchRetrievalDiff,  qaInput,
    setQaInput, chatMessages,  qaFeedback,  qaLoading, 
    beginQaTraceSession, clearQaTraceSession, qaSourcesExpanded, setQaSourcesExpanded, kbQaConvId,
     kbQaConversations,  kbQaConvsLoading, 
    kbQaConvReady,  kbQaMainScrollRef, settingsAgentUrl, setSettingsAgentUrl,
    settingsEmbeddingModelId, setSettingsEmbeddingModelId, settingsFaqPrompt, setSettingsFaqPrompt,
    settingsChunkStrategy, setSettingsChunkStrategy, settingsChunkSize, setSettingsChunkSize,
    settingsChunkOverlap, setSettingsChunkOverlap, settingsMetadataKeys, setSettingsMetadataKeys,
    embeddingModels, llmModels, settingsSaving,  settingsSubTab, setSettingsSubTab,
    indexJobSubmitting,  settingsSubTabs,   
        enqueueIndexJob, 
    onSelectKbQaConversation, onNewKbQaChat, onRenameKbQaChat, onDeleteKbQaChat, alreadyAddedIds,
    openDocPicker, closeDocPicker,  handlePickerSearch, handlePickerChannelSelect,
    handlePickerChannelToggle, handleAddSelectedDocuments, handleRemoveDocument, togglePickerDoc,
    pickerTotalPages, openWikiSpacePicker, closeWikiSpacePicker, handleAddWikiSpaceToKb, handleRemoveWikiSpaceFromKb,
    handleIndexWikiSpace, closeFaqDialog, openFaqFromQa, handlePolishFaqAnswer, handleSaveFaq,
    handleDeleteFaq, openGenerateModal, closeGenerateModal, handleGenerateFaqs, handleSaveGeneratedFaqs,
    handleGenBackToConfig, openChunkEdit, openChunkViewFromId, openChunkEditFromId, closeChunkDialog,
    handleSaveChunk, handleSearch, handleAsk, setKbQaFeedbackVote, kbQaAssistantText, handleSaveSettings,
     objToConfigValues, pickerCanPrev, pickerCanNext, toggleGenDoc, removeGenPreviewFaq,
  } = useKnowledgeBaseDetail();
  const isMobile = useIsMobile();
  const [qaSessionsOpen, setQaSessionsOpen] = useState(false);

  // Leaving the mobile layout closes the sessions drawer. Adjusting state during render
  // (instead of in an effect) avoids a second render pass with a stale drawer.
  if (!isMobile && qaSessionsOpen) setQaSessionsOpen(false);

  useEffect(() => {
    if (!isMobile || !qaSessionsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQaSessionsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobile, qaSessionsOpen]);

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

  const exitQaFullPage = () => {
    clearQaTraceSession();
    setQaFullPage(false);
    setQaSessionsOpen(false);
  };

  const openQaSettings = () => {
    clearQaTraceSession();
    setQaFullPage(false);
    setQaSessionsOpen(false);
    setActiveTab('settings');
  };

  if (qaFullPage && kb.agent_url) {
    const sidebar = (
      <KbQaSessionSidebar
        kbName={kb.name}
        conversations={kbQaConversations}
        activeId={kbQaConvId}
        loading={kbQaConvsLoading}
        disabled={qaLoading}
        hideBackLink={isMobile}
        onSessionActivate={isMobile ? () => setQaSessionsOpen(false) : undefined}
        onBack={exitQaFullPage}
        onOpenSettings={openQaSettings}
        onSelectSession={(id) => void onSelectKbQaConversation(id)}
        onNewChat={() => void onNewKbQaChat()}
        onRename={onRenameKbQaChat}
        onDelete={onDeleteKbQaChat}
      />
    );

    return (
      <ContentCommentsShell
        resourceType="knowledge_base"
        resourceId={kb.id}
        hideComments
      >
      <div className={`kb-detail kb-detail--qa-fullpage${isMobile ? ' kb-detail--qa-mobile' : ''}`}>
        <div className="kb-qa-shell">
          {isMobile ? (
            <PanelToolbar
              as="div"
              className="kb-qa-mobile-toolbar"
              leading={
                <>
                  <button
                    type="button"
                    className="kb-qa-mobile-back"
                    onClick={exitQaFullPage}
                    aria-label={t('detail.qaBackAria')}
                  >
                    <ArrowLeft size={18} />
                    <span className="ds-compact-label">{t('detail.qaBackToKb')}</span>
                  </button>
                  <span className="kb-qa-mobile-title" title={kb.name}>
                    {kb.name}
                  </span>
                </>
              }
              actions={
                <button
                  type="button"
                  className={`kb-qa-mobile-chrome-btn${qaSessionsOpen ? ' is-active' : ''}`}
                  onClick={() => setQaSessionsOpen((o) => !o)}
                  aria-expanded={qaSessionsOpen}
                  aria-controls="kb-qa-sessions-drawer"
                  aria-label={t('detail.qaChatsAria')}
                >
                  <MessageSquare size={18} aria-hidden />
                  <span className="ds-compact-label">{t('detail.qaChatsLabel')}</span>
                </button>
              }
            />
          ) : null}
          <div className="kb-qa-shell-body">
            {isMobile ? (
              <div
                id="kb-qa-sessions-drawer"
                className={`kb-qa-sessions-drawer${qaSessionsOpen ? ' is-open' : ''}`}
                aria-hidden={!qaSessionsOpen}
              >
                {sidebar}
              </div>
            ) : (
              sidebar
            )}
            <main className="kb-qa-main">
              <div className="kb-qa-main-scroll" ref={kbQaMainScrollRef}>
                {chatMessages.length === 0 && !qaLoading ? (
                  <div className="kb-qa-hero">
                    <div className="kb-qa-hero-mark" aria-hidden>
                      <Sparkles size={28} strokeWidth={1.75} />
                    </div>
                    <h1 className="kb-qa-hero-title">{t('detail.qaHeroTitle', { name: kb.name })}</h1>
                    <p className="kb-qa-hero-sub">{t('detail.qaHeroSubtitle')}</p>
                  </div>
                ) : null}
                {chatMessages.length > 0 ? (
                  <div className="kb-qa-thread kb-qa-messages kb-qa-messages--fullpage">
                {chatMessages.map((msg, i) => {
                  const isLast = i === chatMessages.length - 1;
                  return (
                    <div key={msg.id ?? `msg-fp-${i}`} className={`kb-qa-msg kb-qa-msg-${msg.role}`}>
                      <span className="kb-qa-msg-label">
                        {msg.role === 'user' ? t('detail.qaLabelYou') : t('detail.qaLabelAssistant')}
                      </span>
                      {msg.role === 'assistant' && msg.streamParts && msg.streamParts.length > 0 ? (
                        <div className="kb-qa-assistant-stream">
                          <AgentAssistantStreamBody
                            streamParts={msg.streamParts}
                            fallbackText={msg.content}
                          />
                        </div>
                      ) : msg.role === 'assistant' &&
                        !msg.content &&
                        !(msg.streamParts && msg.streamParts.length) &&
                        qaLoading &&
                        isLast ? (
                        <div className="kb-qa-msg-bubble kb-qa-msg-bubble--assistant kb-qa-typing">
                          {t('detail.qaThinking')}
                        </div>
                      ) : (
                        <div
                          className={
                            msg.role === 'user' ? 'kb-qa-msg-bubble kb-qa-msg-bubble--user' : 'kb-qa-msg-bubble kb-qa-msg-bubble--assistant'
                          }
                        >
                          <AgentMessageBody
                            text={msg.content}
                            variant={msg.role === 'user' ? 'user' : 'assistant'}
                          />
                        </div>
                      )}
                      {msg.role === 'assistant' &&
                        kbQaAssistantText(msg) &&
                        !(qaLoading && isLast) &&
                        (() => {
                          const feedbackKey = kbQaFeedbackKey(msg, i);
                          const feedback = qaFeedback[feedbackKey];
                          const prev = chatMessages[i - 1];
                          const question = prev?.role === 'user' ? prev.content.trim() : '';
                          return (
                            <div className="kb-qa-msg-actions kb-qa-msg-feedback">
                              <button
                                type="button"
                                className={`kb-qa-feedback-btn kb-qa-feedback-btn--up${feedback === 'up' ? ' kb-qa-feedback-btn--active' : ''}`}
                                aria-label={t('detail.qaFeedbackUpAria')}
                                aria-pressed={feedback === 'up'}
                                onClick={() => setKbQaFeedbackVote(feedbackKey, 'up')}
                              >
                                <ThumbsUp size={16} strokeWidth={2} aria-hidden />
                              </button>
                              <button
                                type="button"
                                className={`kb-qa-feedback-btn kb-qa-feedback-btn--down${feedback === 'down' ? ' kb-qa-feedback-btn--active' : ''}`}
                                aria-label={t('detail.qaFeedbackDownAria')}
                                aria-pressed={feedback === 'down'}
                                onClick={() => setKbQaFeedbackVote(feedbackKey, 'down')}
                              >
                                <ThumbsDown size={16} strokeWidth={2} aria-hidden />
                              </button>
                              {feedback === 'up' && question ? (
                                <button
                                  type="button"
                                  className="kb-qa-sources-action-btn"
                                  aria-label={t('detail.qaSaveAsFaqAria')}
                                  onClick={() => openFaqFromQa(question, kbQaAssistantText(msg))}
                                >
                                  {t('detail.qaSaveAsFaq')}
                                </button>
                              ) : null}
                            </div>
                          );
                        })()}
                      {msg.sources && msg.sources.length > 0 && (() => {
                        const rk = msg.replyKey ?? `legacy-${i}`;
                        const expandedSet = qaSourcesExpanded[rk];
                        const expandedList = expandedSet ? [...expandedSet].sort((a, b) => a - b) : [];
                        return (
                          <div className="kb-qa-sources" role="region" aria-label={t('detail.qaSourcesAria')}>
                            <div className="kb-qa-sources-toolbar">
                              <div className="kb-qa-sources-heading">{t('detail.qaSourcesHeading')}</div>
                              <div className="kb-qa-sources-actions">
                                <button
                                  type="button"
                                  className="kb-qa-sources-action-btn"
                                  onClick={() =>
                                    setQaSourcesExpanded((prev) => ({
                                      ...prev,
                                      [rk]: new Set(msg.sources!.map((_, ix) => ix)),
                                    }))
                                  }
                                >
                                  {t('detail.qaSourcesExpandAll')}
                                </button>
                                <button
                                  type="button"
                                  className="kb-qa-sources-action-btn"
                                  onClick={() => setQaSourcesExpanded((prev) => ({ ...prev, [rk]: new Set() }))}
                                >
                                  {t('detail.qaSourcesCollapseAll')}
                                </button>
                              </div>
                            </div>
                            <div className="kb-qa-sources-chips" role="list">
                              {msg.sources.map((s, j) => {
                                const kind = kbQaNormalizeSourceKind(s.source_type);
                                const chipMod = kbQaSourceChipModifierClass(s.source_type);
                                const kindLabel = t(`detail.qaSourceKind.${kind}`, {
                                  defaultValue: s.source_type || kind,
                                });
                                const showScore = kbQaShowRetrievalScore(s.source_type, s.score);
                                const chipTitle = kbQaChipTitle(s);
                                const isOpen = expandedSet?.has(j) ?? false;
                                return (
                                  <button
                                    key={`${s.id}-${j}`}
                                    type="button"
                                    role="listitem"
                                    className={`kb-qa-source-chip ${chipMod}${isOpen ? ' kb-qa-source-chip--open' : ''}`}
                                    aria-expanded={isOpen}
                                    aria-label={t('detail.qaSourceChipAria', { kind: kindLabel, title: chipTitle })}
                                    onClick={() =>
                                      setQaSourcesExpanded((prev) => {
                                        const next = { ...prev };
                                        const cur = new Set(next[rk] || []);
                                        if (cur.has(j)) cur.delete(j);
                                        else cur.add(j);
                                        next[rk] = cur;
                                        return next;
                                      })
                                    }
                                  >
                                    <span className="kb-qa-source-chip__kind">{kindLabel}</span>
                                    <span className="kb-qa-source-chip__title">{chipTitle}</span>
                                    {showScore ? (
                                      <span className="kb-qa-source-chip__score">
                                        {t('detail.qaSourceScore', { pct: (s.score * 100).toFixed(0) })}
                                      </span>
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                            {expandedList.length > 0 ? (
                              <div className="kb-qa-sources-panels">
                                {expandedList.map((j) => {
                                  const s = msg.sources![j];
                                  const kind = kbQaNormalizeSourceKind(s.source_type);
                                  const mod = kbQaSourceCardModifierClass(s.source_type);
                                  const kindLabel = t(`detail.qaSourceKind.${kind}`, {
                                    defaultValue: s.source_type || kind,
                                  });
                                  const detailPreview = kbQaTruncatePreview(
                                    s.content || '',
                                    kbQaExpandedDetailPreviewMaxLen(s.source_type)
                                  );
                                  const showScore = kbQaShowRetrievalScore(s.source_type, s.score);
                                  return (
                                    <div
                                      key={`panel-${rk}-${j}-${s.id}`}
                                      className={`kb-qa-source-card kb-qa-source-card--static ${mod}`}
                                    >
                                      <div className="kb-qa-source-card__head">
                                        <span className="kb-qa-source-card__kind">{kindLabel}</span>
                                        {showScore ? (
                                          <span className="kb-qa-source-card__score">
                                            {t('detail.qaSourceScore', { pct: (s.score * 100).toFixed(0) })}
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="kb-qa-source-card__title">
                                        {s.wiki_page_id && s.wiki_space_id ? (
                                          <Link
                                            className="kb-qa-source-card__link"
                                            to={`/wikis/${s.wiki_space_id}/pages/${s.wiki_page_id}`}
                                          >
                                            {s.source_name || s.wiki_page_id}
                                          </Link>
                                        ) : s.document_id ? (
                                          <Link className="kb-qa-source-card__link" to={`/documents/view/${s.document_id}`}>
                                            {s.source_name || s.document_id}
                                          </Link>
                                        ) : (
                                          <span className="kb-qa-source-card__title-text">
                                            {s.source_name || t('detail.faqSourceFallback')}
                                          </span>
                                        )}
                                      </div>
                                      {detailPreview ? (
                                        <p className="kb-qa-source-card__preview">{detailPreview}</p>
                                      ) : null}
                                      <KbRetrievalProvenancePanel s={s} t={t} />
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
                  </div>
                ) : null}
              </div>
              <div className="kb-qa-composer-outer">
                <form className="kb-qa-composer" onSubmit={handleAsk}>
                  <textarea
                    className="kb-qa-composer-input"
                    placeholder={t('detail.qaPlaceholder')}
                    value={qaInput}
                    onChange={(e) => setQaInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                      }
                    }}
                    disabled={qaLoading || !kbQaConvReady}
                    rows={1}
                    autoComplete="off"
                    aria-label={t('detail.qaPlaceholder')}
                  />
                  <div className="kb-qa-composer-bar">
                    <p className="kb-qa-composer-hint">{t('detail.qaComposerHint')}</p>
                    <button
                      type="submit"
                      className="kb-qa-composer-send"
                      disabled={qaLoading || !qaInput.trim() || !kbQaConvReady}
                      aria-label={t('detail.qaSendAria')}
                    >
                      <ArrowUp size={18} strokeWidth={2.25} aria-hidden />
                    </button>
                  </div>
                </form>
              </div>
            </main>
          </div>
        </div>
        {faqDialog}
      </div>
      </ContentCommentsShell>
    );
  }

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
        {kb.agent_url ? (
          <button
            type="button"
            className="btn btn-primary btn-sm kb-detail-header-qa-btn"
            onClick={() => {
              beginQaTraceSession();
              setQaFullPage(true);
            }}
            aria-label={t('detail.qaOpenChat')}
          >
            <MessageSquare size={18} aria-hidden />
            <span className="ds-compact-label">{t('detail.qaOpenChat')}</span>
          </button>
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
          <section className="kb-section">
            <PanelToolbar
              className="kb-section-header"
              leading={<span>{t('detail.documentsTitle', { count: docTotal })}</span>}
              actions={
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={openDocPicker}
                  aria-label={t('detail.addDocument')}
                >
                  <Plus size={16} aria-hidden />
                  <span className="ds-compact-label">{t('detail.addDocument')}</span>
                </button>
              }
            />
            {docTotal === 0 ? (
              <p className="kb-empty-text">{t('detail.emptyDocuments')}</p>
            ) : (
              <>
              <div className="ds-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th>{t('detail.colName')}</th>
                      <th>{t('detail.colType')}</th>
                      <th>{t('detail.colStatus')}</th>
                      <th className="kb-table-actions">{t('detail.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((doc) => (
                      <tr key={doc.id}>
                        <td>
                          <div className="kb-table-name">
                            <FileStack size={18} />
                            <Link to={`/documents/view/${doc.document_id}`}>{doc.document_name || doc.document_id}</Link>
                          </div>
                        </td>
                        <td>{doc.document_file_type}</td>
                        <td>{doc.document_status}</td>
                        <td className="kb-table-actions">
                          <div className="kb-table-btns">
                            <Link to={`/documents/view/${doc.document_id}`} title={t('detail.view')} aria-label={t('detail.view')}>
                              <Eye size={16} />
                            </Link>
                            <button type="button" title={t('detail.remove')} aria-label={t('detail.remove')} onClick={() => handleRemoveDocument(doc.document_id)}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {docTotal > 0 && (
                <div className="kb-pagination">
                  <div className="kb-pagination-info">
                    <span>
                      {t('detail.paginationRange', {
                        start: docTotal === 0 ? 0 : docPage * docPageSize + 1,
                        end: Math.min((docPage + 1) * docPageSize, docTotal),
                        total: docTotal,
                      })}
                    </span>
                    <label>
                      <span>{t('detail.pageSize')}</span>
                      <select
                        value={docPageSize}
                        onChange={(e) => {
                          setDocPageSize(Number(e.target.value));
                          setDocPage(0);
                        }}
                      >
                        {[25, 50, 100, 200].map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {Math.ceil(docTotal / docPageSize) > 1 && (
                    <div className="kb-pagination-btns">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setDocPage(0)}
                        disabled={docPage === 0}
                        title={t('detail.firstPage')}
                      >
                        «
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setDocPage((p) => Math.max(0, p - 1))}
                        disabled={docPage === 0}
                      >
                        {t('detail.previous')}
                      </button>
                      <span className="kb-pagination-nums">
                        {t('detail.pageOf', {
                          current: docPage + 1,
                          total: Math.ceil(docTotal / docPageSize) || 1,
                        })}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setDocPage((p) => Math.min(Math.ceil(docTotal / docPageSize) - 1, p + 1))}
                        disabled={docPage >= Math.ceil(docTotal / docPageSize) - 1}
                      >
                        {t('detail.next')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setDocPage(Math.ceil(docTotal / docPageSize) - 1)}
                        disabled={docPage >= Math.ceil(docTotal / docPageSize) - 1}
                        title={t('detail.lastPage')}
                      >
                        »
                      </button>
                    </div>
                  )}
                </div>
              )}
              </>
            )}
          </section>
        )}

        {/* ===== WIKI SPACES TAB ===== */}
        {activeTab === 'wiki_spaces' && (
          <section className="kb-section">
            <PanelToolbar
              className="kb-section-header"
              leading={<span>{t('detail.wikiSpacesTitle')}</span>}
              actions={
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void openWikiSpacePicker()}
                  aria-label={t('detail.addWikiSpace')}
                >
                  <Plus size={16} aria-hidden />
                  <span className="ds-compact-label">{t('detail.addWikiSpace')}</span>
                </button>
              }
            />
            <p className="kb-section-desc kb-wiki-index-hint">{t('detail.wikiIndexHint')}</p>
            {kbWikiSpaces.length === 0 ? (
              <p className="kb-empty-text">{t('detail.emptyWikiSpaces')}</p>
            ) : (
              <div className="ds-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th>{t('detail.colWikiSpace')}</th>
                      <th className="kb-table-actions">{t('detail.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kbWikiSpaces.map((ws) => (
                      <tr key={ws.id}>
                        <td>
                          <div className="kb-table-name">
                            <BookOpen size={18} />
                            <Link to={`/wikis/${ws.wiki_space_id}/pages/graph`}>{ws.wiki_space_name || ws.wiki_space_id}</Link>
                          </div>
                        </td>
                        <td className="kb-table-actions">
                          <div className="kb-table-btns">
                            <button
                              type="button"
                              title={t('detail.indexWikiSpace')}
                              aria-label={t('detail.indexWikiSpace')}
                              disabled={wikiSpaceBusyId === ws.wiki_space_id || !kb?.embedding_model_id}
                              onClick={() => void handleIndexWikiSpace(ws.wiki_space_id)}
                            >
                              {wikiSpaceBusyId === ws.wiki_space_id ? (
                                <Loader2 size={16} className="kb-spinner-inline" aria-hidden />
                              ) : (
                                <RefreshCw size={16} aria-hidden />
                              )}
                            </button>
                            <Link to={`/wikis/${ws.wiki_space_id}/pages/graph`} title={t('detail.view')} aria-label={t('detail.view')}>
                              <Eye size={16} />
                            </Link>
                            <button
                              type="button"
                              title={t('detail.remove')}
                              aria-label={t('detail.remove')}
                              disabled={wikiSpaceBusyId === ws.wiki_space_id}
                              onClick={() => void handleRemoveWikiSpaceFromKb(ws.wiki_space_id)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ===== FAQS TAB ===== */}
        {activeTab === 'faqs' && (
          <section className="kb-section">
            <PanelToolbar
              className="kb-section-header"
              leading={<span>{t('detail.faqsTitle', { count: faqTotal })}</span>}
              actions={
                <div className="kb-section-header-btns">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => void openGenerateModal()}
                    aria-label={t('detail.generateFaq')}
                  >
                    <Sparkles size={16} aria-hidden />
                    <span className="ds-compact-label">{t('detail.generateFaq')}</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    aria-label={t('detail.addFaq')}
                    onClick={() => {
                    setEditFaq(null);
                    setFaqDialogSource('manual');
                    setFaqQuestion('');
                    setFaqAnswer('');
                    setFaqLabelsValues(objToConfigValues({}, kb?.metadata_keys ?? undefined));
                    setFaqDocMetadataValues(objToConfigValues({}, kb?.metadata_keys ?? undefined));
                    setFaqLabelAllowMultiple({});
                    setFaqMetadataIsArray({});
                    setShowFaqDialog(true);
                  }}
                  >
                    <Plus size={16} aria-hidden />
                    <span className="ds-compact-label">{t('detail.addFaq')}</span>
                  </button>
                </div>
              }
            />

            {faqTotal === 0 ? (
              <p className="kb-empty-text">{t('detail.emptyFaqs')}</p>
            ) : (
              <>
              <div className="ds-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th className="kb-table-question-col">{t('detail.colQuestion')}</th>
                      <th>{t('detail.colAnswer')}</th>
                      <th className="kb-table-source-col">{t('detail.colSource')}</th>
                      <th className="kb-table-actions">{t('detail.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faqs.map((faq) => (
                      <tr key={faq.id}>
                        <td className="kb-table-question-col">
                          <div className="kb-table-name">
                            <HelpCircle size={18} />
                            <span>{faq.question}</span>
                          </div>
                        </td>
                        <td className="kb-table-excerpt">{faq.answer}</td>
                        <td className="kb-table-source-col">
                          <span
                            className="kb-table-source"
                            title={faq.document_name || faq.document_id || undefined}
                          >
                            {faq.document_name || faq.document_id || t('detail.dash')}
                          </span>
                        </td>
                        <td className="kb-table-actions">
                          <div className="kb-table-btns">
                            <button type="button" title={t('detail.edit')} aria-label={t('detail.edit')} onClick={async () => {
                              setEditFaq(faq);
                              setFaqDialogSource('manual');
                              setFaqQuestion(faq.question);
                              setFaqAnswer(faq.answer);
                              const metaValues = objToConfigValues(faq.doc_metadata, kb?.metadata_keys ?? undefined);
                              setFaqLabelsValues(metaValues);
                              setFaqDocMetadataValues(metaValues);
                              const metadataIsArray: Record<string, boolean> = {};
                              if (faq.document_id && kb?.metadata_keys?.length) {
                                try {
                                  const doc = await fetchDocumentById(faq.document_id);
                                  const channel = await fetchChannelById(doc.channel_id);
                                  const metaFields = normalizeExtractionSchemaToFields(channel.extraction_schema ?? null);
                                  const metaMap = new Map(metaFields.map((f) => [f.key, f.type === 'array']));
                                  const lcMap = new Map(
                                    (channel.label_config ?? []).map((lc: { key: string; type?: string }) => [lc.key, lc.type === 'list[object_type]'])
                                  );
                                  for (const k of kb.metadata_keys) {
                                    metadataIsArray[k] = metaMap.get(k) ?? lcMap.get(k) ?? false;
                                  }
                                } catch {
                                  /* default to false */
                                }
                              }
                              setFaqLabelAllowMultiple({});
                              setFaqMetadataIsArray(metadataIsArray);
                              setShowFaqDialog(true);
                            }}>
                              <Pencil size={16} />
                            </button>
                            <button type="button" title={t('detail.remove')} aria-label={t('detail.remove')} onClick={() => handleDeleteFaq(faq.id)}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {faqTotal > 0 && (
                <div className="kb-pagination">
                  <div className="kb-pagination-info">
                    <span>
                      {t('detail.paginationRange', {
                        start: faqTotal === 0 ? 0 : faqPage * faqPageSize + 1,
                        end: Math.min((faqPage + 1) * faqPageSize, faqTotal),
                        total: faqTotal,
                      })}
                    </span>
                    <label>
                      <span>{t('detail.pageSize')}</span>
                      <select
                        value={faqPageSize}
                        onChange={(e) => {
                          setFaqPageSize(Number(e.target.value));
                          setFaqPage(0);
                        }}
                      >
                        {[25, 50, 100, 200].map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {Math.ceil(faqTotal / faqPageSize) > 1 && (
                    <div className="kb-pagination-btns">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setFaqPage(0)}
                        disabled={faqPage === 0}
                        title={t('detail.firstPage')}
                      >
                        «
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setFaqPage((p) => Math.max(0, p - 1))}
                        disabled={faqPage === 0}
                      >
                        {t('detail.previous')}
                      </button>
                      <span className="kb-pagination-nums">
                        {t('detail.pageOf', {
                          current: faqPage + 1,
                          total: Math.ceil(faqTotal / faqPageSize) || 1,
                        })}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setFaqPage((p) => Math.min(Math.ceil(faqTotal / faqPageSize) - 1, p + 1))}
                        disabled={faqPage >= Math.ceil(faqTotal / faqPageSize) - 1}
                      >
                        {t('detail.next')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setFaqPage(Math.ceil(faqTotal / faqPageSize) - 1)}
                        disabled={faqPage >= Math.ceil(faqTotal / faqPageSize) - 1}
                        title={t('detail.lastPage')}
                      >
                        »
                      </button>
                    </div>
                  )}
                </div>
              )}
              </>
            )}
          </section>
        )}

        {/* ===== CHUNKS TAB ===== */}
        {activeTab === 'chunks' && (
          <section className="kb-section">
            <PanelToolbar
              className="kb-section-header"
              leading={<span>{t('detail.chunksTitle', { count: chunkTotal })}</span>}
            />
            {chunkTotal === 0 ? (
              <p className="kb-empty-text">{t('detail.emptyChunks')}</p>
            ) : (
              <>
              <div className="ds-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th>{t('detail.chunkSource')}</th>
                      <th>{t('detail.colExcerpt')}</th>
                      <th>{t('detail.colTokens')}</th>
                      <th>{t('detail.colEmbedded')}</th>
                      <th className="kb-table-actions">{t('detail.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chunks.map((chunk) => (
                      <tr key={chunk.id}>
                        <td>
                          <div className="kb-table-name">
                            <Layers size={18} />
                            {chunk.document_id ? (
                              <Link to={`/documents/view/${chunk.document_id}`}>{chunk.document_name || chunk.document_id}</Link>
                            ) : chunk.wiki_page_id && chunk.wiki_space_id ? (
                              <Link to={`/wikis/${chunk.wiki_space_id}/pages/${chunk.wiki_page_id}`}>
                                {chunk.document_name || chunk.wiki_page_id}
                              </Link>
                            ) : (
                              <span>{chunk.document_name || chunk.document_id || chunk.wiki_page_id || t('detail.dash')}</span>
                            )}
                          </div>
                        </td>
                        <td className="kb-table-excerpt">{chunk.content.slice(0, 150)}...</td>
                        <td>{chunk.token_count ?? t('detail.dash')}</td>
                        <td>{chunk.has_embedding ? t('detail.yes') : t('detail.no')}</td>
                        <td className="kb-table-actions">
                          <div className="kb-table-btns">
                            <button type="button" title={t('detail.edit')} aria-label={t('detail.edit')} onClick={() => openChunkEdit(chunk)}>
                              <Pencil size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {chunkTotal > 0 && (
                <div className="kb-pagination">
                  <div className="kb-pagination-info">
                    <span>
                      {t('detail.paginationRange', {
                        start: chunkTotal === 0 ? 0 : chunkPage * chunkPageSize + 1,
                        end: Math.min((chunkPage + 1) * chunkPageSize, chunkTotal),
                        total: chunkTotal,
                      })}
                    </span>
                    <label>
                      <span>{t('detail.pageSize')}</span>
                      <select
                        value={chunkPageSize}
                        onChange={(e) => {
                          setChunkPageSize(Number(e.target.value));
                          setChunkPage(0);
                        }}
                      >
                        {[25, 50, 100, 200].map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {Math.ceil(chunkTotal / chunkPageSize) > 1 && (
                    <div className="kb-pagination-btns">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setChunkPage(0)}
                        disabled={chunkPage === 0}
                        title={t('detail.firstPage')}
                      >
                        «
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setChunkPage((p) => Math.max(0, p - 1))}
                        disabled={chunkPage === 0}
                      >
                        {t('detail.previous')}
                      </button>
                      <span className="kb-pagination-nums">
                        {t('detail.pageOf', {
                          current: chunkPage + 1,
                          total: Math.ceil(chunkTotal / chunkPageSize) || 1,
                        })}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setChunkPage((p) => Math.min(Math.ceil(chunkTotal / chunkPageSize) - 1, p + 1))}
                        disabled={chunkPage >= Math.ceil(chunkTotal / chunkPageSize) - 1}
                      >
                        {t('detail.next')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setChunkPage(Math.ceil(chunkTotal / chunkPageSize) - 1)}
                        disabled={chunkPage >= Math.ceil(chunkTotal / chunkPageSize) - 1}
                        title={t('detail.lastPage')}
                      >
                        »
                      </button>
                    </div>
                  )}
                </div>
              )}
              </>
            )}
          </section>
        )}

        {/* ===== SEARCH TAB ===== */}
        {activeTab === 'search' && (
          <section className="kb-section kb-search-section">
            <h2>{t('detail.searchTitle')}</h2>
            <p className="kb-section-desc">
              {t('detail.searchDesc')}
            </p>
            <div className="kb-search-type-tabs">
              {(['all', 'chunks', 'faqs'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`kb-search-type-tab${searchType === type ? ' active' : ''}`}
                  onClick={() => setSearchType(type)}
                  aria-pressed={searchType === type}
                >
                  {type === 'all' ? t('detail.searchTypeAll') : type === 'chunks' ? t('detail.searchTypeChunks') : t('detail.searchTypeFaqs')}
                </button>
              ))}
            </div>
            <form className="kb-search-form" onSubmit={handleSearch}>
              <SearchIcon size={20} />
              <input
                type="search"
                aria-label={t('detail.searchAria')}
                placeholder={t('detail.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="kb-search-input"
              />
              <button
                type="submit"
                className="kb-search-submit"
                disabled={searching}
                aria-label={searching ? t('detail.searching') : t('detail.search')}
              >
                <Send size={18} aria-hidden />
                <span className="ds-compact-label">{searching ? t('detail.searching') : t('detail.search')}</span>
              </button>
            </form>

            <div className="kb-search-options-wrap">
              <button
                type="button"
                className="kb-search-options-toggle"
                onClick={() => setSearchOptionsExpanded((o) => !o)}
                aria-expanded={searchOptionsExpanded}
              >
                {searchOptionsExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                <Filter size={16} aria-hidden />
                <span>{t('detail.searchOptionsToggle')}</span>
                {(Object.values(searchLabelFilters).some(Boolean) ||
                  Object.values(searchMetadataFilters).some(Boolean) ||
                  searchForceDense ||
                  searchTopK !== 10) && (
                  <span className="kb-search-options-badge">{t('detail.filtersActive')}</span>
                )}
              </button>
              {searchOptionsExpanded ? (
                <div className="kb-search-options-panel">
                  <div className="kb-search-options-block">
                    <div className="kb-search-options-block-title">{t('detail.searchOptionsRankingTitle')}</div>
                    <div className="kb-search-options-row">
                      <label className="kb-search-advanced-field">
                        <span>{t('detail.searchTopKLabel')}</span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={searchTopK}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setSearchTopK(Number.isFinite(n) ? Math.min(50, Math.max(1, Math.trunc(n))) : 10);
                          }}
                        />
                      </label>
                      <label className="kb-search-advanced-checkbox">
                        <input
                          type="checkbox"
                          checked={searchForceDense}
                          onChange={(e) => setSearchForceDense(e.target.checked)}
                        />
                        <span>{t('detail.searchForceDense')}</span>
                      </label>
                    </div>
                    <p className="kb-search-advanced-hint">{t('detail.searchAdvancedHint')}</p>
                  </div>

                  {kb?.metadata_keys?.length ? (
                    <>
                      <hr className="kb-search-options-sep" />
                      <div className="kb-search-options-block">
                        <div className="kb-search-options-block-title">{t('detail.metadataLabel')}</div>
                        <p className="kb-search-filters-hint">{t('detail.filtersHint')}</p>
                        <div className="kb-search-filters-group">
                          {kb.metadata_keys.map((key) => (
                            <div key={key} className="kb-search-filter-row">
                              <label htmlFor={`search-meta-${key}`}>{key}</label>
                              <input
                                id={`search-meta-${key}`}
                                type="text"
                                placeholder={t('detail.placeholderMetaExample')}
                                value={searchMetadataFilters[key] ?? ''}
                                onChange={(e) => setSearchMetadataFilters((prev) => ({ ...prev, [key]: e.target.value }))}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <hr className="kb-search-options-sep" />
                      <p className="kb-search-options-empty-hint">{t('detail.metadataKeysEmptyHint')}</p>
                    </>
                  )}
                </div>
              ) : null}
            </div>

            {hasSearched && searchResults.length > 0 && (
              <div className="kb-search-results-panel">
                <h3>{t('detail.resultsTitle', { count: searchResults.length })}</h3>
                {searchRetrievalDiff &&
                (searchRetrievalDiff.added.length > 0 ||
                  searchRetrievalDiff.removed.length > 0 ||
                  searchRetrievalDiff.moved.length > 0) ? (
                  <div className="kb-search-diff-panel" role="region" aria-label={t('detail.searchDiffAria')}>
                    <h4 className="kb-search-diff-title">{t('detail.searchDiffTitle')}</h4>
                    {searchRetrievalDiff.added.length > 0 ? (
                      <p className="kb-search-diff-line">
                        <strong>{t('detail.searchDiffAdded')}</strong> {searchRetrievalDiff.added.length}
                      </p>
                    ) : null}
                    {searchRetrievalDiff.removed.length > 0 ? (
                      <p className="kb-search-diff-line">
                        <strong>{t('detail.searchDiffRemoved')}</strong> {searchRetrievalDiff.removed.length}
                      </p>
                    ) : null}
                    {searchRetrievalDiff.moved.length > 0 ? (
                      <ul className="kb-search-diff-moves">
                        {searchRetrievalDiff.moved.slice(0, 20).map((m) => (
                          <li key={m.id}>
                            {t('detail.searchDiffMoved', {
                              id: m.id.length > 24 ? `${m.id.slice(0, 20)}…` : m.id,
                              from: m.from + 1,
                              to: m.to + 1,
                            })}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                <ul className="kb-search-results-list">
                  {searchResults.map((r) => (
                    <li key={r.id} className="kb-search-result-item">
                      <span className="kb-search-result-source">
                        [{r.source_type}]
                        {r.source_type === 'chunk' && r.wiki_page_id && r.wiki_space_id && (
                          <span className="kb-search-result-kind"> {t('detail.searchHitWiki')} </span>
                        )}{' '}
                        {r.wiki_page_id && r.wiki_space_id ? (
                          <Link to={`/wikis/${r.wiki_space_id}/pages/${r.wiki_page_id}`}>
                            {r.source_name || r.wiki_page_id}
                          </Link>
                        ) : r.document_id ? (
                          <Link to={`/documents/view/${r.document_id}`}>{r.source_name || r.document_id}</Link>
                        ) : (
                          <span>{r.source_name || r.document_id || t('detail.faqSourceFallback')}</span>
                        )}
                      </span>
                      <p className="kb-search-result-excerpt">{r.content.slice(0, 300)}</p>
                      <span className="kb-search-result-score">{t('detail.matchPercent', { pct: (r.score * 100).toFixed(0) })}</span>
                      <KbRetrievalProvenancePanel s={r} t={t} />
                      {r.source_type === 'chunk' ? (
                        <div className="kb-search-result-chunk-actions">
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openChunkViewFromId(r.id)}>
                            {t('detail.chunkView')}
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openChunkEditFromId(r.id)}>
                            {t('detail.chunkEdit')}
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {hasSearched && searchResults.length === 0 && (
              <p className="kb-empty-text">{t('detail.noSearchResults')}</p>
            )}

            {!hasSearched && (
              <div className="kb-search-empty">
                <SearchIcon size={48} strokeWidth={1} />
                <p>{t('detail.searchEmptyPrompt')}</p>
              </div>
            )}
          </section>
        )}

        {/* ===== SETTINGS TAB ===== */}
        {activeTab === 'settings' && (
          <section className="kb-section kb-settings-section">
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
                <div className="kb-settings-col kb-settings-col-models">
                  <label>
                    <span>{t('detail.qaAgentUrl')}</span>
                    <input
                      type="url"
                      placeholder={t('detail.qaAgentUrlPlaceholder')}
                      value={settingsAgentUrl}
                      onChange={(e) => setSettingsAgentUrl(e.target.value)}
                    />
                    <small>{t('detail.qaAgentUrlHelp')}</small>
                  </label>

                  <label>
                    <span>{t('detail.embeddingModel')}</span>
                    <select value={settingsEmbeddingModelId} onChange={(e) => setSettingsEmbeddingModelId(e.target.value)}>
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
                      <select value={settingsChunkStrategy} onChange={(e) => setSettingsChunkStrategy(e.target.value)}>
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
                      />
                    </label>
                  </fieldset>
                </div>

                <div className="kb-settings-col kb-settings-col-text">
                  <label>
                    <span>{t('detail.faqGenPrompt')}</span>
                    <textarea
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

