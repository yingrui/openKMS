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
import { KbRetrievalProvenancePanel } from './KnowledgeBaseDetail.searchUtils';
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
import './KnowledgeBaseDetail.scss';

export function KnowledgeBaseDetail() {
  const vm = useKnowledgeBaseDetail();

  if (vm.loading) return <div className="kb-detail"><p>{vm.t('detail.loading')}</p></div>;
  if (!vm.kb) return <div className="kb-detail"><p>{vm.t('detail.notFound')}</p></div>;

  const faqDialog = (
    <KbFaqDialog
      show={vm.showFaqDialog}
      editFaq={vm.editFaq}
      faqDialogSource={vm.faqDialogSource}
      faqPolishing={vm.faqPolishing}
      onClose={vm.closeFaqDialog}
      faqQuestion={vm.faqQuestion}
      onFaqQuestionChange={vm.setFaqQuestion}
      faqAnswer={vm.faqAnswer}
      onFaqAnswerChange={vm.setFaqAnswer}
      onPolishFaqAnswer={() => void vm.handlePolishFaqAnswer()}
      metadataKeys={vm.kb.metadata_keys}
      faqMetadataIsArray={vm.faqMetadataIsArray}
      faqDocMetadataValues={vm.faqDocMetadataValues}
      onFaqDocMetadataValuesChange={vm.setFaqDocMetadataValues}
      onSaveFaq={vm.handleSaveFaq}
    />
  );

  if (vm.qaFullPage && vm.kb.agent_url) {
    return (
      <ContentCommentsShell
        resourceType="knowledge_base"
        resourceId={vm.kb.id}
        hideComments
      >
      <div className="kb-detail kb-detail--qa-fullpage">
        <div className="kb-qa-shell">
          <div className="kb-qa-shell-body">
            <KbQaSessionSidebar
              kbName={vm.kb.name}
              conversations={vm.kbQaConversations}
              activeId={vm.kbQaConvId}
              loading={vm.kbQaConvsLoading}
              disabled={vm.qaLoading}
              onBack={() => {
                vm.qaTraceSessionRef.current = null;
                vm.setQaFullPage(false);
              }}
              onOpenSettings={() => {
                vm.qaTraceSessionRef.current = null;
                vm.setQaFullPage(false);
                vm.setActiveTab('settings');
              }}
              onSelectSession={(id) => void vm.onSelectKbQaConversation(id)}
              onNewChat={() => void vm.onNewKbQaChat()}
              onRename={vm.onRenameKbQaChat}
              onDelete={vm.onDeleteKbQaChat}
            />
            <main className="kb-qa-main">
              <div className="kb-qa-main-scroll" ref={vm.kbQaMainScrollRef}>
                {vm.chatMessages.length === 0 && !vm.qaLoading ? (
                  <div className="kb-qa-hero">
                    <div className="kb-qa-hero-mark" aria-hidden>
                      <Sparkles size={28} strokeWidth={1.75} />
                    </div>
                    <h1 className="kb-qa-hero-title">{vm.t('detail.qaHeroTitle', { name: vm.kb.name })}</h1>
                    <p className="kb-qa-hero-sub">{vm.t('detail.qaHeroSubtitle')}</p>
                  </div>
                ) : null}
                {vm.chatMessages.length > 0 ? (
                  <div className="kb-qa-thread kb-qa-messages kb-qa-messages--fullpage">
                {vm.chatMessages.map((msg, i) => {
                  const isLast = i === vm.chatMessages.length - 1;
                  return (
                    <div key={msg.id ?? `msg-fp-${i}`} className={`kb-qa-msg kb-qa-msg-${msg.role}`}>
                      <span className="kb-qa-msg-label">
                        {msg.role === 'user' ? vm.t('detail.qaLabelYou') : vm.t('detail.qaLabelAssistant')}
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
                        vm.qaLoading &&
                        isLast ? (
                        <div className="kb-qa-msg-bubble kb-qa-msg-bubble--assistant kb-qa-typing">
                          {vm.t('detail.qaThinking')}
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
                        vm.kbQaAssistantText(msg) &&
                        !(vm.qaLoading && isLast) &&
                        (() => {
                          const feedbackKey = kbQaFeedbackKey(msg, i);
                          const feedback = vm.qaFeedback[feedbackKey];
                          const prev = vm.chatMessages[i - 1];
                          const question = prev?.role === 'user' ? prev.content.trim() : '';
                          return (
                            <div className="kb-qa-msg-actions kb-qa-msg-feedback">
                              <button
                                type="button"
                                className={`kb-qa-feedback-btn kb-qa-feedback-btn--up${feedback === 'up' ? ' kb-qa-feedback-btn--active' : ''}`}
                                aria-label={vm.t('detail.qaFeedbackUpAria')}
                                aria-pressed={feedback === 'up'}
                                onClick={() => vm.setKbQaFeedbackVote(feedbackKey, 'up')}
                              >
                                <ThumbsUp size={16} strokeWidth={2} aria-hidden />
                              </button>
                              <button
                                type="button"
                                className={`kb-qa-feedback-btn kb-qa-feedback-btn--down${feedback === 'down' ? ' kb-qa-feedback-btn--active' : ''}`}
                                aria-label={vm.t('detail.qaFeedbackDownAria')}
                                aria-pressed={feedback === 'down'}
                                onClick={() => vm.setKbQaFeedbackVote(feedbackKey, 'down')}
                              >
                                <ThumbsDown size={16} strokeWidth={2} aria-hidden />
                              </button>
                              {feedback === 'up' && question ? (
                                <button
                                  type="button"
                                  className="kb-qa-sources-action-btn"
                                  aria-label={vm.t('detail.qaSaveAsFaqAria')}
                                  onClick={() => vm.openFaqFromQa(question, vm.kbQaAssistantText(msg))}
                                >
                                  {vm.t('detail.qaSaveAsFaq')}
                                </button>
                              ) : null}
                            </div>
                          );
                        })()}
                      {msg.sources && msg.sources.length > 0 && (() => {
                        const rk = msg.replyKey ?? `legacy-${i}`;
                        const expandedSet = vm.qaSourcesExpanded[rk];
                        const expandedList = expandedSet ? [...expandedSet].sort((a, b) => a - b) : [];
                        return (
                          <div className="kb-qa-sources" role="region" aria-label={vm.t('detail.qaSourcesAria')}>
                            <div className="kb-qa-sources-toolbar">
                              <div className="kb-qa-sources-heading">{vm.t('detail.qaSourcesHeading')}</div>
                              <div className="kb-qa-sources-actions">
                                <button
                                  type="button"
                                  className="kb-qa-sources-action-btn"
                                  onClick={() =>
                                    vm.setQaSourcesExpanded((prev) => ({
                                      ...prev,
                                      [rk]: new Set(msg.sources!.map((_, ix) => ix)),
                                    }))
                                  }
                                >
                                  {vm.t('detail.qaSourcesExpandAll')}
                                </button>
                                <button
                                  type="button"
                                  className="kb-qa-sources-action-btn"
                                  onClick={() => vm.setQaSourcesExpanded((prev) => ({ ...prev, [rk]: new Set() }))}
                                >
                                  {vm.t('detail.qaSourcesCollapseAll')}
                                </button>
                              </div>
                            </div>
                            <div className="kb-qa-sources-chips" role="list">
                              {msg.sources.map((s, j) => {
                                const kind = kbQaNormalizeSourceKind(s.source_type);
                                const chipMod = kbQaSourceChipModifierClass(s.source_type);
                                const kindLabel = vm.t(`detail.qaSourceKind.${kind}`, {
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
                                    aria-label={vm.t('detail.qaSourceChipAria', { kind: kindLabel, title: chipTitle })}
                                    onClick={() =>
                                      vm.setQaSourcesExpanded((prev) => {
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
                                        {vm.t('detail.qaSourceScore', { pct: (s.score * 100).toFixed(0) })}
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
                                  const kindLabel = vm.t(`detail.qaSourceKind.${kind}`, {
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
                                            {vm.t('detail.qaSourceScore', { pct: (s.score * 100).toFixed(0) })}
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
                                            {s.source_name || vm.t('detail.faqSourceFallback')}
                                          </span>
                                        )}
                                      </div>
                                      {detailPreview ? (
                                        <p className="kb-qa-source-card__preview">{detailPreview}</p>
                                      ) : null}
                                      <KbRetrievalProvenancePanel s={s} t={vm.t} />
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
                <form className="kb-qa-composer" onSubmit={vm.handleAsk}>
                  <textarea
                    className="kb-qa-composer-input"
                    placeholder={vm.t('detail.qaPlaceholder')}
                    value={vm.qaInput}
                    onChange={(e) => vm.setQaInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                      }
                    }}
                    disabled={vm.qaLoading || !vm.kbQaConvReady}
                    rows={1}
                    autoComplete="off"
                    aria-label={vm.t('detail.qaPlaceholder')}
                  />
                  <div className="kb-qa-composer-bar">
                    <p className="kb-qa-composer-hint">{vm.t('detail.qaComposerHint')}</p>
                    <button
                      type="submit"
                      className="kb-qa-composer-send"
                      disabled={vm.qaLoading || !vm.qaInput.trim() || !vm.kbQaConvReady}
                      aria-label={vm.t('detail.qaSendAria')}
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
    <ContentCommentsShell resourceType="knowledge_base" resourceId={vm.kb.id}>
    <div className="kb-detail">
      <Link to="/knowledge-bases" className="kb-detail-back">
        <ArrowLeft size={18} />
        <span>{vm.t('detail.backToList')}</span>
      </Link>

      <header className="kb-detail-header kb-detail-header--split">
        <div className="kb-detail-header-text">
          <h1>{vm.kb.name}</h1>
          <p className="kb-detail-desc">{vm.kb.description || vm.t('detail.noDescription')}</p>
          <div className="kb-detail-stats">
            <span>{vm.t('detail.statDocs', { count: vm.kb.document_count })}</span>
            <span>{vm.t('detail.statWikiSpaces', { count: vm.kb.wiki_space_count ?? 0 })}</span>
            <span>{vm.t('detail.statFaqs', { count: vm.kb.faq_count })}</span>
            <span>{vm.t('detail.statChunks', { count: vm.kb.chunk_count })}</span>
          </div>
        </div>
        <div className="kb-detail-header-actions">
          {vm.kb.embedding_model_id ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm kb-detail-header-index-btn"
              onClick={() => void vm.enqueueIndexJob()}
              disabled={vm.indexJobSubmitting}
              title={vm.t('detail.indexJobHeaderTitle')}
            >
              {vm.indexJobSubmitting ? (
                <Loader2 size={18} className="kb-spinner-inline" aria-hidden />
              ) : (
                <RefreshCw size={18} aria-hidden />
              )}
              <span>{vm.t('detail.indexJobHeader')}</span>
            </button>
          ) : null}
        {vm.kb.agent_url ? (
          <button
            type="button"
            className="btn btn-primary btn-sm kb-detail-header-qa-btn"
            onClick={() => {
              vm.qaTraceSessionRef.current = crypto.randomUUID();
              vm.setQaFullPage(true);
            }}
          >
            <MessageSquare size={18} />
            <span>{vm.t('detail.qaOpenChat')}</span>
          </button>
        ) : null}
        </div>
      </header>

      <div className="kb-detail-tabs">
        {TAB_ORDER.map((tabId) => {
          const Icon = TAB_ICONS[tabId];
          return (
            <button
              key={tabId}
              type="button"
              className={`kb-tab ${vm.activeTab === tabId ? 'active' : ''}`}
              onClick={() => vm.setActiveTab(tabId)}
            >
              <Icon size={18} />
              <span>{vm.t(`detail.tabs.${tabId}`)}</span>
            </button>
          );
        })}
      </div>

      <div className="kb-detail-content">
        {/* ===== DOCUMENTS TAB ===== */}
        {vm.activeTab === 'documents' && (
          <section className="kb-section">
            <PanelToolbar
              className="kb-section-header"
              leading={<span>{vm.t('detail.documentsTitle', { count: vm.docTotal })}</span>}
              actions={
                <button type="button" className="btn btn-primary btn-sm" onClick={vm.openDocPicker}>
                  <Plus size={16} />
                  <span>{vm.t('detail.addDocument')}</span>
                </button>
              }
            />
            {vm.docTotal === 0 ? (
              <p className="kb-empty-text">{vm.t('detail.emptyDocuments')}</p>
            ) : (
              <>
              <div className="ds-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th>{vm.t('detail.colName')}</th>
                      <th>{vm.t('detail.colType')}</th>
                      <th>{vm.t('detail.colStatus')}</th>
                      <th className="kb-table-actions">{vm.t('detail.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vm.docs.map((doc) => (
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
                            <Link to={`/documents/view/${doc.document_id}`} title={vm.t('detail.view')} aria-label={vm.t('detail.view')}>
                              <Eye size={16} />
                            </Link>
                            <button type="button" title={vm.t('detail.remove')} aria-label={vm.t('detail.remove')} onClick={() => vm.handleRemoveDocument(doc.document_id)}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {vm.docTotal > 0 && (
                <div className="kb-pagination">
                  <div className="kb-pagination-info">
                    <span>
                      {vm.t('detail.paginationRange', {
                        start: vm.docTotal === 0 ? 0 : vm.docPage * vm.docPageSize + 1,
                        end: Math.min((vm.docPage + 1) * vm.docPageSize, vm.docTotal),
                        total: vm.docTotal,
                      })}
                    </span>
                    <label>
                      <span>{vm.t('detail.pageSize')}</span>
                      <select
                        value={vm.docPageSize}
                        onChange={(e) => {
                          vm.setDocPageSize(Number(e.target.value));
                          vm.setDocPage(0);
                        }}
                      >
                        {[25, 50, 100, 200].map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {Math.ceil(vm.docTotal / vm.docPageSize) > 1 && (
                    <div className="kb-pagination-btns">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => vm.setDocPage(0)}
                        disabled={vm.docPage === 0}
                        title={vm.t('detail.firstPage')}
                      >
                        «
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => vm.setDocPage((p) => Math.max(0, p - 1))}
                        disabled={vm.docPage === 0}
                      >
                        {vm.t('detail.previous')}
                      </button>
                      <span className="kb-pagination-nums">
                        {vm.t('detail.pageOf', {
                          current: vm.docPage + 1,
                          total: Math.ceil(vm.docTotal / vm.docPageSize) || 1,
                        })}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => vm.setDocPage((p) => Math.min(Math.ceil(vm.docTotal / vm.docPageSize) - 1, p + 1))}
                        disabled={vm.docPage >= Math.ceil(vm.docTotal / vm.docPageSize) - 1}
                      >
                        {vm.t('detail.next')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => vm.setDocPage(Math.ceil(vm.docTotal / vm.docPageSize) - 1)}
                        disabled={vm.docPage >= Math.ceil(vm.docTotal / vm.docPageSize) - 1}
                        title={vm.t('detail.lastPage')}
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
        {vm.activeTab === 'wiki_spaces' && (
          <section className="kb-section">
            <PanelToolbar
              className="kb-section-header"
              leading={<span>{vm.t('detail.wikiSpacesTitle')}</span>}
              actions={
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void vm.openWikiSpacePicker()}>
                  <Plus size={16} />
                  <span>{vm.t('detail.addWikiSpace')}</span>
                </button>
              }
            />
            <p className="kb-section-desc kb-wiki-index-hint">{vm.t('detail.wikiIndexHint')}</p>
            {vm.kbWikiSpaces.length === 0 ? (
              <p className="kb-empty-text">{vm.t('detail.emptyWikiSpaces')}</p>
            ) : (
              <div className="ds-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th>{vm.t('detail.colWikiSpace')}</th>
                      <th className="kb-table-actions">{vm.t('detail.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vm.kbWikiSpaces.map((ws) => (
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
                              title={vm.t('detail.indexWikiSpace')}
                              aria-label={vm.t('detail.indexWikiSpace')}
                              disabled={vm.wikiSpaceBusyId === ws.wiki_space_id || !vm.kb?.embedding_model_id}
                              onClick={() => void vm.handleIndexWikiSpace(ws.wiki_space_id)}
                            >
                              {vm.wikiSpaceBusyId === ws.wiki_space_id ? (
                                <Loader2 size={16} className="kb-spinner-inline" aria-hidden />
                              ) : (
                                <RefreshCw size={16} aria-hidden />
                              )}
                            </button>
                            <Link to={`/wikis/${ws.wiki_space_id}/pages/graph`} title={vm.t('detail.view')} aria-label={vm.t('detail.view')}>
                              <Eye size={16} />
                            </Link>
                            <button
                              type="button"
                              title={vm.t('detail.remove')}
                              aria-label={vm.t('detail.remove')}
                              disabled={vm.wikiSpaceBusyId === ws.wiki_space_id}
                              onClick={() => void vm.handleRemoveWikiSpaceFromKb(ws.wiki_space_id)}
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
        {vm.activeTab === 'faqs' && (
          <section className="kb-section">
            <PanelToolbar
              className="kb-section-header"
              leading={<span>{vm.t('detail.faqsTitle', { count: vm.faqTotal })}</span>}
              actions={
                <div className="kb-section-header-btns">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => void vm.openGenerateModal()}>
                    <Sparkles size={16} />
                    <span>{vm.t('detail.generateFaq')}</span>
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => {
                    vm.setEditFaq(null);
                    vm.setFaqDialogSource('manual');
                    vm.setFaqQuestion('');
                    vm.setFaqAnswer('');
                    vm.setFaqLabelsValues(vm.objToConfigValues({}, vm.kb?.metadata_keys ?? undefined));
                    vm.setFaqDocMetadataValues(vm.objToConfigValues({}, vm.kb?.metadata_keys ?? undefined));
                    vm.setFaqLabelAllowMultiple({});
                    vm.setFaqMetadataIsArray({});
                    vm.setShowFaqDialog(true);
                  }}>
                    <Plus size={16} />
                    <span>{vm.t('detail.addFaq')}</span>
                  </button>
                </div>
              }
            />

            {vm.faqTotal === 0 ? (
              <p className="kb-empty-text">{vm.t('detail.emptyFaqs')}</p>
            ) : (
              <>
              <div className="ds-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th className="kb-table-question-col">{vm.t('detail.colQuestion')}</th>
                      <th>{vm.t('detail.colAnswer')}</th>
                      <th className="kb-table-source-col">{vm.t('detail.colSource')}</th>
                      <th className="kb-table-actions">{vm.t('detail.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vm.faqs.map((faq) => (
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
                            {faq.document_name || faq.document_id || vm.t('detail.dash')}
                          </span>
                        </td>
                        <td className="kb-table-actions">
                          <div className="kb-table-btns">
                            <button type="button" title={vm.t('detail.edit')} aria-label={vm.t('detail.edit')} onClick={async () => {
                              vm.setEditFaq(faq);
                              vm.setFaqDialogSource('manual');
                              vm.setFaqQuestion(faq.question);
                              vm.setFaqAnswer(faq.answer);
                              const metaValues = vm.objToConfigValues(faq.doc_metadata, vm.kb?.metadata_keys ?? undefined);
                              vm.setFaqLabelsValues(metaValues);
                              vm.setFaqDocMetadataValues(metaValues);
                              const metadataIsArray: Record<string, boolean> = {};
                              if (faq.document_id && vm.kb?.metadata_keys?.length) {
                                try {
                                  const doc = await fetchDocumentById(faq.document_id);
                                  const channel = await fetchChannelById(doc.channel_id);
                                  const metaFields = normalizeExtractionSchemaToFields(channel.extraction_schema ?? null);
                                  const metaMap = new Map(metaFields.map((f) => [f.key, f.type === 'array']));
                                  const lcMap = new Map(
                                    (channel.label_config ?? []).map((lc: { key: string; type?: string }) => [lc.key, lc.type === 'list[object_type]'])
                                  );
                                  for (const k of vm.kb.metadata_keys) {
                                    metadataIsArray[k] = metaMap.get(k) ?? lcMap.get(k) ?? false;
                                  }
                                } catch {
                                  /* default to false */
                                }
                              }
                              vm.setFaqLabelAllowMultiple({});
                              vm.setFaqMetadataIsArray(metadataIsArray);
                              vm.setShowFaqDialog(true);
                            }}>
                              <Pencil size={16} />
                            </button>
                            <button type="button" title={vm.t('detail.remove')} aria-label={vm.t('detail.remove')} onClick={() => vm.handleDeleteFaq(faq.id)}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {vm.faqTotal > 0 && (
                <div className="kb-pagination">
                  <div className="kb-pagination-info">
                    <span>
                      {vm.t('detail.paginationRange', {
                        start: vm.faqTotal === 0 ? 0 : vm.faqPage * vm.faqPageSize + 1,
                        end: Math.min((vm.faqPage + 1) * vm.faqPageSize, vm.faqTotal),
                        total: vm.faqTotal,
                      })}
                    </span>
                    <label>
                      <span>{vm.t('detail.pageSize')}</span>
                      <select
                        value={vm.faqPageSize}
                        onChange={(e) => {
                          vm.setFaqPageSize(Number(e.target.value));
                          vm.setFaqPage(0);
                        }}
                      >
                        {[25, 50, 100, 200].map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {Math.ceil(vm.faqTotal / vm.faqPageSize) > 1 && (
                    <div className="kb-pagination-btns">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => vm.setFaqPage(0)}
                        disabled={vm.faqPage === 0}
                        title={vm.t('detail.firstPage')}
                      >
                        «
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => vm.setFaqPage((p) => Math.max(0, p - 1))}
                        disabled={vm.faqPage === 0}
                      >
                        {vm.t('detail.previous')}
                      </button>
                      <span className="kb-pagination-nums">
                        {vm.t('detail.pageOf', {
                          current: vm.faqPage + 1,
                          total: Math.ceil(vm.faqTotal / vm.faqPageSize) || 1,
                        })}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => vm.setFaqPage((p) => Math.min(Math.ceil(vm.faqTotal / vm.faqPageSize) - 1, p + 1))}
                        disabled={vm.faqPage >= Math.ceil(vm.faqTotal / vm.faqPageSize) - 1}
                      >
                        {vm.t('detail.next')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => vm.setFaqPage(Math.ceil(vm.faqTotal / vm.faqPageSize) - 1)}
                        disabled={vm.faqPage >= Math.ceil(vm.faqTotal / vm.faqPageSize) - 1}
                        title={vm.t('detail.lastPage')}
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
        {vm.activeTab === 'chunks' && (
          <section className="kb-section">
            <PanelToolbar
              className="kb-section-header"
              leading={<span>{vm.t('detail.chunksTitle', { count: vm.chunkTotal })}</span>}
            />
            {vm.chunkTotal === 0 ? (
              <p className="kb-empty-text">{vm.t('detail.emptyChunks')}</p>
            ) : (
              <>
              <div className="ds-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th>{vm.t('detail.chunkSource')}</th>
                      <th>{vm.t('detail.colExcerpt')}</th>
                      <th>{vm.t('detail.colTokens')}</th>
                      <th>{vm.t('detail.colEmbedded')}</th>
                      <th className="kb-table-actions">{vm.t('detail.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vm.chunks.map((chunk) => (
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
                              <span>{chunk.document_name || chunk.document_id || chunk.wiki_page_id || vm.t('detail.dash')}</span>
                            )}
                          </div>
                        </td>
                        <td className="kb-table-excerpt">{chunk.content.slice(0, 150)}...</td>
                        <td>{chunk.token_count ?? vm.t('detail.dash')}</td>
                        <td>{chunk.has_embedding ? vm.t('detail.yes') : vm.t('detail.no')}</td>
                        <td className="kb-table-actions">
                          <div className="kb-table-btns">
                            <button type="button" title={vm.t('detail.edit')} aria-label={vm.t('detail.edit')} onClick={() => vm.openChunkEdit(chunk)}>
                              <Pencil size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {vm.chunkTotal > 0 && (
                <div className="kb-pagination">
                  <div className="kb-pagination-info">
                    <span>
                      {vm.t('detail.paginationRange', {
                        start: vm.chunkTotal === 0 ? 0 : vm.chunkPage * vm.chunkPageSize + 1,
                        end: Math.min((vm.chunkPage + 1) * vm.chunkPageSize, vm.chunkTotal),
                        total: vm.chunkTotal,
                      })}
                    </span>
                    <label>
                      <span>{vm.t('detail.pageSize')}</span>
                      <select
                        value={vm.chunkPageSize}
                        onChange={(e) => {
                          vm.setChunkPageSize(Number(e.target.value));
                          vm.setChunkPage(0);
                        }}
                      >
                        {[25, 50, 100, 200].map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {Math.ceil(vm.chunkTotal / vm.chunkPageSize) > 1 && (
                    <div className="kb-pagination-btns">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => vm.setChunkPage(0)}
                        disabled={vm.chunkPage === 0}
                        title={vm.t('detail.firstPage')}
                      >
                        «
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => vm.setChunkPage((p) => Math.max(0, p - 1))}
                        disabled={vm.chunkPage === 0}
                      >
                        {vm.t('detail.previous')}
                      </button>
                      <span className="kb-pagination-nums">
                        {vm.t('detail.pageOf', {
                          current: vm.chunkPage + 1,
                          total: Math.ceil(vm.chunkTotal / vm.chunkPageSize) || 1,
                        })}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => vm.setChunkPage((p) => Math.min(Math.ceil(vm.chunkTotal / vm.chunkPageSize) - 1, p + 1))}
                        disabled={vm.chunkPage >= Math.ceil(vm.chunkTotal / vm.chunkPageSize) - 1}
                      >
                        {vm.t('detail.next')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => vm.setChunkPage(Math.ceil(vm.chunkTotal / vm.chunkPageSize) - 1)}
                        disabled={vm.chunkPage >= Math.ceil(vm.chunkTotal / vm.chunkPageSize) - 1}
                        title={vm.t('detail.lastPage')}
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
        {vm.activeTab === 'search' && (
          <section className="kb-section kb-search-section">
            <h2>{vm.t('detail.searchTitle')}</h2>
            <p className="kb-section-desc">
              {vm.t('detail.searchDesc')}
            </p>
            <div className="kb-search-type-tabs">
              {(['all', 'chunks', 'faqs'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`kb-search-type-tab${vm.searchType === type ? ' active' : ''}`}
                  onClick={() => vm.setSearchType(type)}
                  aria-pressed={vm.searchType === type}
                >
                  {type === 'all' ? vm.t('detail.searchTypeAll') : type === 'chunks' ? vm.t('detail.searchTypeChunks') : vm.t('detail.searchTypeFaqs')}
                </button>
              ))}
            </div>
            <form className="kb-search-form" onSubmit={vm.handleSearch}>
              <SearchIcon size={20} />
              <input
                type="search"
                aria-label={vm.t('detail.searchAria')}
                placeholder={vm.t('detail.searchPlaceholder')}
                value={vm.searchQuery}
                onChange={(e) => vm.setSearchQuery(e.target.value)}
                className="kb-search-input"
              />
              <button type="submit" className="kb-search-submit" disabled={vm.searching}>
                <Send size={18} />
                <span>{vm.searching ? vm.t('detail.searching') : vm.t('detail.search')}</span>
              </button>
            </form>

            <div className="kb-search-options-wrap">
              <button
                type="button"
                className="kb-search-options-toggle"
                onClick={() => vm.setSearchOptionsExpanded((o) => !o)}
                aria-expanded={vm.searchOptionsExpanded}
              >
                {vm.searchOptionsExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                <Filter size={16} aria-hidden />
                <span>{vm.t('detail.searchOptionsToggle')}</span>
                {(Object.values(vm.searchLabelFilters).some(Boolean) ||
                  Object.values(vm.searchMetadataFilters).some(Boolean) ||
                  vm.searchForceDense ||
                  vm.searchTopK !== 10) && (
                  <span className="kb-search-options-badge">{vm.t('detail.filtersActive')}</span>
                )}
              </button>
              {vm.searchOptionsExpanded ? (
                <div className="kb-search-options-panel">
                  <div className="kb-search-options-block">
                    <div className="kb-search-options-block-title">{vm.t('detail.searchOptionsRankingTitle')}</div>
                    <div className="kb-search-options-row">
                      <label className="kb-search-advanced-field">
                        <span>{vm.t('detail.searchTopKLabel')}</span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={vm.searchTopK}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            vm.setSearchTopK(Number.isFinite(n) ? Math.min(50, Math.max(1, Math.trunc(n))) : 10);
                          }}
                        />
                      </label>
                      <label className="kb-search-advanced-checkbox">
                        <input
                          type="checkbox"
                          checked={vm.searchForceDense}
                          onChange={(e) => vm.setSearchForceDense(e.target.checked)}
                        />
                        <span>{vm.t('detail.searchForceDense')}</span>
                      </label>
                    </div>
                    <p className="kb-search-advanced-hint">{vm.t('detail.searchAdvancedHint')}</p>
                  </div>

                  {vm.kb?.metadata_keys?.length ? (
                    <>
                      <hr className="kb-search-options-sep" />
                      <div className="kb-search-options-block">
                        <div className="kb-search-options-block-title">{vm.t('detail.metadataLabel')}</div>
                        <p className="kb-search-filters-hint">{vm.t('detail.filtersHint')}</p>
                        <div className="kb-search-filters-group">
                          {vm.kb.metadata_keys.map((key) => (
                            <div key={key} className="kb-search-filter-row">
                              <label htmlFor={`search-meta-${key}`}>{key}</label>
                              <input
                                id={`search-meta-${key}`}
                                type="text"
                                placeholder={vm.t('detail.placeholderMetaExample')}
                                value={vm.searchMetadataFilters[key] ?? ''}
                                onChange={(e) => vm.setSearchMetadataFilters((prev) => ({ ...prev, [key]: e.target.value }))}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <hr className="kb-search-options-sep" />
                      <p className="kb-search-options-empty-hint">{vm.t('detail.metadataKeysEmptyHint')}</p>
                    </>
                  )}
                </div>
              ) : null}
            </div>

            {vm.hasSearched && vm.searchResults.length > 0 && (
              <div className="kb-search-results-panel">
                <h3>{vm.t('detail.resultsTitle', { count: vm.searchResults.length })}</h3>
                {vm.searchRetrievalDiff &&
                (vm.searchRetrievalDiff.added.length > 0 ||
                  vm.searchRetrievalDiff.removed.length > 0 ||
                  vm.searchRetrievalDiff.moved.length > 0) ? (
                  <div className="kb-search-diff-panel" role="region" aria-label={vm.t('detail.searchDiffAria')}>
                    <h4 className="kb-search-diff-title">{vm.t('detail.searchDiffTitle')}</h4>
                    {vm.searchRetrievalDiff.added.length > 0 ? (
                      <p className="kb-search-diff-line">
                        <strong>{vm.t('detail.searchDiffAdded')}</strong> {vm.searchRetrievalDiff.added.length}
                      </p>
                    ) : null}
                    {vm.searchRetrievalDiff.removed.length > 0 ? (
                      <p className="kb-search-diff-line">
                        <strong>{vm.t('detail.searchDiffRemoved')}</strong> {vm.searchRetrievalDiff.removed.length}
                      </p>
                    ) : null}
                    {vm.searchRetrievalDiff.moved.length > 0 ? (
                      <ul className="kb-search-diff-moves">
                        {vm.searchRetrievalDiff.moved.slice(0, 20).map((m) => (
                          <li key={m.id}>
                            {vm.t('detail.searchDiffMoved', {
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
                  {vm.searchResults.map((r) => (
                    <li key={r.id} className="kb-search-result-item">
                      <span className="kb-search-result-source">
                        [{r.source_type}]
                        {r.source_type === 'chunk' && r.wiki_page_id && r.wiki_space_id && (
                          <span className="kb-search-result-kind"> {vm.t('detail.searchHitWiki')} </span>
                        )}{' '}
                        {r.wiki_page_id && r.wiki_space_id ? (
                          <Link to={`/wikis/${r.wiki_space_id}/pages/${r.wiki_page_id}`}>
                            {r.source_name || r.wiki_page_id}
                          </Link>
                        ) : r.document_id ? (
                          <Link to={`/documents/view/${r.document_id}`}>{r.source_name || r.document_id}</Link>
                        ) : (
                          <span>{r.source_name || r.document_id || vm.t('detail.faqSourceFallback')}</span>
                        )}
                      </span>
                      <p className="kb-search-result-excerpt">{r.content.slice(0, 300)}</p>
                      <span className="kb-search-result-score">{vm.t('detail.matchPercent', { pct: (r.score * 100).toFixed(0) })}</span>
                      <KbRetrievalProvenancePanel s={r} t={vm.t} />
                      {r.source_type === 'chunk' ? (
                        <div className="kb-search-result-chunk-actions">
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void vm.openChunkViewFromId(r.id)}>
                            {vm.t('detail.chunkView')}
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void vm.openChunkEditFromId(r.id)}>
                            {vm.t('detail.chunkEdit')}
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {vm.hasSearched && vm.searchResults.length === 0 && (
              <p className="kb-empty-text">{vm.t('detail.noSearchResults')}</p>
            )}

            {!vm.hasSearched && (
              <div className="kb-search-empty">
                <SearchIcon size={48} strokeWidth={1} />
                <p>{vm.t('detail.searchEmptyPrompt')}</p>
              </div>
            )}
          </section>
        )}

        {/* ===== SETTINGS TAB ===== */}
        {vm.activeTab === 'settings' && (
          <section className="kb-section kb-settings-section">
            <h2 id="kb-settings-heading" className="kb-settings-page-title">
              {vm.t('detail.settingsTitle')}
            </h2>

            <div className="kb-settings-subtabs" role="tablist" aria-label={vm.t('detail.settingsTitle')}>
              {vm.settingsSubTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={vm.settingsSubTab === tab.id}
                  className={`kb-settings-subtab ${vm.settingsSubTab === tab.id ? 'active' : ''}`}
                  onClick={() => vm.setSettingsSubTab(tab.id)}
                >
                  <tab.icon size={16} aria-hidden />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="kb-settings-subtab-panel" role="tabpanel">
              {vm.settingsSubTab === 'sharing' && vm.kbId ? (
                <ResourceSharePanel
                  resourceType={RESOURCE_TYPES.knowledgeBase}
                  resourceId={vm.kbId}
                  title={vm.t('detail.sharingTitle')}
                />
              ) : null}

              {vm.settingsSubTab === 'general' ? (
                <>
            <div className="kb-settings-header-row">
              <p className="kb-settings-general-lead">{vm.t('detail.settingsGeneralLead')}</p>
              <button
                type="button"
                className="btn btn-primary kb-settings-header-save"
                disabled={vm.settingsSaving}
                onClick={vm.handleSaveSettings}
              >
                {vm.settingsSaving ? vm.t('detail.savingSettings') : vm.t('detail.saveSettings')}
              </button>
            </div>

            <div className="kb-settings-form">
              <div className="kb-settings-layout">
                <div className="kb-settings-col kb-settings-col-models">
                  <label>
                    <span>{vm.t('detail.qaAgentUrl')}</span>
                    <input
                      type="url"
                      placeholder={vm.t('detail.qaAgentUrlPlaceholder')}
                      value={vm.settingsAgentUrl}
                      onChange={(e) => vm.setSettingsAgentUrl(e.target.value)}
                    />
                    <small>{vm.t('detail.qaAgentUrlHelp')}</small>
                  </label>

                  <label>
                    <span>{vm.t('detail.embeddingModel')}</span>
                    <select value={vm.settingsEmbeddingModelId} onChange={(e) => vm.setSettingsEmbeddingModelId(e.target.value)}>
                      <option value="">{vm.t('detail.modelNone')}</option>
                      {vm.embeddingModels.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} ({m.model_name})</option>
                      ))}
                    </select>
                    <small>{vm.t('detail.embeddingHelp')}</small>
                  </label>

                  <fieldset className="kb-settings-fieldset">
                    <legend>{vm.t('detail.chunkingFieldset')}</legend>
                    <label>
                      <span>{vm.t('detail.strategy')}</span>
                      <select value={vm.settingsChunkStrategy} onChange={(e) => vm.setSettingsChunkStrategy(e.target.value)}>
                        <option value="fixed_size">{vm.t('detail.strategyFixedSize')}</option>
                        <option value="markdown_header">{vm.t('detail.strategyMarkdownHeader')}</option>
                        <option value="paragraph">{vm.t('detail.strategyParagraph')}</option>
                      </select>
                    </label>
                    <label>
                      <span>{vm.t('detail.chunkSize')}</span>
                      <input
                        type="number"
                        min={100}
                        max={10000}
                        value={vm.settingsChunkSize}
                        onChange={(e) => vm.setSettingsChunkSize(Number(e.target.value))}
                      />
                    </label>
                    <label>
                      <span>{vm.t('detail.chunkOverlap')}</span>
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        value={vm.settingsChunkOverlap}
                        onChange={(e) => vm.setSettingsChunkOverlap(Number(e.target.value))}
                      />
                    </label>
                  </fieldset>
                </div>

                <div className="kb-settings-col kb-settings-col-text">
                  <label>
                    <span>{vm.t('detail.faqGenPrompt')}</span>
                    <textarea
                      placeholder={vm.t('detail.faqGenPromptPlaceholder')}
                      value={vm.settingsFaqPrompt}
                      onChange={(e) => vm.setSettingsFaqPrompt(e.target.value)}
                      rows={6}
                    />
                    <small>{vm.t('detail.faqGenPromptHelp')}</small>
                  </label>

                  <label>
                    <span>{vm.t('detail.metadataKeys')}</span>
                    <input
                      type="text"
                      placeholder={vm.t('detail.metadataKeysPlaceholder')}
                      value={vm.settingsMetadataKeys}
                      onChange={(e) => vm.setSettingsMetadataKeys(e.target.value)}
                    />
                    <small>{vm.t('detail.metadataKeysHelp')}</small>
                  </label>
                </div>
              </div>

              <fieldset className="kb-settings-fieldset kb-settings-index-fieldset">
                <legend>{vm.t('detail.indexJobTitle')}</legend>
                <div className="kb-settings-index-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={vm.indexJobSubmitting || !vm.kb?.embedding_model_id}
                    onClick={() => void vm.enqueueIndexJob()}
                  >
                    {vm.indexJobSubmitting ? (
                      <>
                        <Loader2 size={14} className="kb-spinner-inline" />
                        {vm.t('detail.indexJobButtonRunning')}
                      </>
                    ) : (
                      vm.t('detail.indexJobButton')
                    )}
                  </button>
                  <Link to="/job-runs" className="kb-settings-index-jobs-link">
                    {vm.t('detail.indexJobViewJobs')}
                  </Link>
                </div>
                <small className="kb-settings-index-help">{vm.t('detail.indexJobHelp')}</small>
                {!vm.kb?.embedding_model_id ? (
                  <small className="kb-settings-index-warn">{vm.t('detail.indexJobRequiresEmbedding')}</small>
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
        show={vm.showGenerateModal}
        genStep={vm.genStep}
        onClose={vm.closeGenerateModal}
        generating={vm.generating}
        genSaving={vm.genSaving}
        genProgress={vm.genProgress}
        genModelId={vm.genModelId}
        onGenModelIdChange={vm.setGenModelId}
        llmModels={vm.llmModels}
        genPrompt={vm.genPrompt}
        onGenPromptChange={vm.setGenPrompt}
        genDocs={vm.genDocs}
        genSelectedDocs={vm.genSelectedDocs}
        onGenSelectedDocsChange={vm.setGenSelectedDocs}
        onToggleGenDoc={vm.toggleGenDoc}
        genPreviewFaqs={vm.genPreviewFaqs}
        onRemoveGenPreviewFaq={vm.removeGenPreviewFaq}
        onGenerateFaqs={() => void vm.handleGenerateFaqs()}
        onGenBackToConfig={vm.handleGenBackToConfig}
        onSaveGeneratedFaqs={() => void vm.handleSaveGeneratedFaqs()}
      />

      <KbDocPickerDialog
        show={vm.showDocPicker}
        onClose={vm.closeDocPicker}
        pickerAdding={vm.pickerAdding}
        channels={vm.channels}
        pickerSelectedChannel={vm.pickerSelectedChannel}
        pickerChannelExpanded={vm.pickerChannelExpanded}
        onPickerChannelSelect={vm.handlePickerChannelSelect}
        onPickerChannelToggle={vm.handlePickerChannelToggle}
        pickerSearch={vm.pickerSearch}
        onPickerSearch={vm.handlePickerSearch}
        pickerLoading={vm.pickerLoading}
        pickerResults={vm.pickerResults}
        alreadyAddedIds={vm.alreadyAddedIds}
        pickerSelected={vm.pickerSelected}
        onTogglePickerDoc={vm.togglePickerDoc}
        pickerTotal={vm.pickerTotal}
        pickerPage={vm.pickerPage}
        pickerPageSize={vm.pickerPageSize}
        onPickerPageChange={vm.setPickerPage}
        pickerCanPrev={vm.pickerCanPrev}
        pickerCanNext={vm.pickerCanNext}
        pickerTotalPages={vm.pickerTotalPages}
        onAddSelectedDocuments={() => void vm.handleAddSelectedDocuments()}
      />

      <KbWikiSpacePickerDialog
        show={vm.showWikiSpacePicker}
        onClose={vm.closeWikiSpacePicker}
        wikiSpacePickerLoading={vm.wikiSpacePickerLoading}
        wikiSpacePickerItems={vm.wikiSpacePickerItems}
        kbWikiSpaces={vm.kbWikiSpaces}
        wikiSpaceBusyId={vm.wikiSpaceBusyId}
        onAddWikiSpaceToKb={(id) => void vm.handleAddWikiSpaceToKb(id)}
      />

      <KbChunkDialog
        show={vm.showChunkDialog}
        editChunk={vm.editChunk}
        onClose={vm.closeChunkDialog}
        chunkSaving={vm.chunkSaving}
        chunkContent={vm.chunkContent}
        onChunkContentChange={vm.setChunkContent}
        chunkDialogReadOnly={vm.chunkDialogReadOnly}
        metadataKeys={vm.kb?.metadata_keys}
        chunkMetadataIsArray={vm.chunkMetadataIsArray}
        chunkDocMetadataValues={vm.chunkDocMetadataValues}
        onChunkDocMetadataValuesChange={vm.setChunkDocMetadataValues}
        onSaveChunk={() => void vm.handleSaveChunk()}
      />

      {faqDialog}
    </div>
    </ContentCommentsShell>
  );
}

