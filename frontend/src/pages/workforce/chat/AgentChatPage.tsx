import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUp, FolderTree, MessageSquare, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';
import { polishFAQAnswer, createFAQ, type KnowledgeBaseResponse } from '../../../data/knowledgeBasesApi';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useImmersiveView } from '../../../contexts/ImmersiveShellContext';
import { Dialog, FormField, PanelToolbar } from '../../../styles/design-system';
import { AgentAssistantStreamBody } from '../../../components/agents/AgentAssistantStreamBody';
import { AgentMessageBody } from '../../../components/agents/AgentMessageBody';
import { ChatFilesRail } from './ChatFilesRail';
import { ChatSessionSidebar } from './ChatSessionSidebar';
import { ChatSourcesDrawer, ChatSourcesPill, type ChatSourcesPanelPayload } from './ChatSourcesDrawer';
import { chatFeedbackKey, splitQaSources } from './chatUtils';
import { useAgentChat } from './useAgentChat';
import './AgentChat.scss';

/**
 * The conversation screen: session rail, thread, composer, sources, files.
 *
 * It renders a workforce agent answering from **one** knowledge source. The source owns the thread (its
 * corpus supplies the citations), the agent owns how the answer is produced — which is why this page takes
 * a `kb` and knows nothing about agents beyond the id it uses in URLs.
 *
 * The copy is the knowledge-base one (`knowledgeBase` i18n namespace, `detail.qa*`): the screen moved, its
 * words did not need to.
 */
export function AgentChatPage({ agentId, kb }: { agentId: string; kb: KnowledgeBaseResponse }) {
  const { t } = useTranslation('workforce');
  /* Saving an answer as a knowledge-base FAQ: the words for that live with the FAQ feature, not here. */
  const { t: tk } = useTranslation('knowledgeBase');
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const chat = useAgentChat({ agentId, kb, conversationId, navigate, t });

  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sourcesPanel, setSourcesPanel] = useState<ChatSourcesPanelPayload | null>(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const shellBodyRef = useRef<HTMLDivElement>(null);

  /* A conversation takes the whole viewport, as the knowledge-base Q&A did: the rail is the only chrome. */
  useImmersiveView('openkms-kb-qa-fullpage', true);

  // Leaving the mobile layout closes the sessions drawer (during render, so no stale second pass).
  if (!isMobile && sessionsOpen) setSessionsOpen(false);

  useEffect(() => {
    if (!isMobile || !sessionsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSessionsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobile, sessionsOpen]);

  // --- Save an answer as a knowledge-base FAQ (the one action that reaches past the conversation) ---
  const [faqOpen, setFaqOpen] = useState(false);
  const [faqQuestion, setFaqQuestion] = useState('');
  const [faqAnswer, setFaqAnswer] = useState('');
  const [faqPolishing, setFaqPolishing] = useState(false);

  const openFaqFromAnswer = (question: string, answer: string) => {
    setFaqQuestion(question.trim());
    setFaqAnswer(answer.trim());
    setFaqOpen(true);
  };

  const closeFaq = () => {
    setFaqOpen(false);
    setFaqPolishing(false);
  };

  const polishFaq = async () => {
    if (!faqQuestion.trim() || !faqAnswer.trim() || faqPolishing) return;
    setFaqPolishing(true);
    try {
      const res = await polishFAQAnswer(kb.id, {
        question: faqQuestion.trim(),
        answer: faqAnswer.trim(),
      });
      setFaqAnswer(res.answer);
      toast.success(tk('detail.toastFaqPolished'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : tk('detail.toastFaqPolishFailed'));
    } finally {
      setFaqPolishing(false);
    }
  };

  const saveFaq = async () => {
    if (!faqQuestion.trim() || !faqAnswer.trim()) return;
    try {
      await createFAQ(kb.id, {
        question: faqQuestion.trim(),
        answer: faqAnswer.trim(),
      });
      toast.success(tk('detail.toastFaqCreated'));
      closeFaq();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : tk('detail.toastFaqCreateFailed'));
    }
  };

  const goToAgent = () => navigate(`/workforce/${agentId}`);

  const sidebar = (
    <ChatSessionSidebar
      kbName={kb.name}
      conversations={chat.kbQaConversations}
      activeId={chat.kbQaConvId}
      loading={chat.kbQaConvsLoading}
      disabled={chat.qaLoading}
      hideBackLink={isMobile}
      onSessionActivate={isMobile ? () => setSessionsOpen(false) : undefined}
      onBack={goToAgent}
      onOpenSettings={goToAgent}
      onSelectSession={(id) => {
        setSourcesPanel(null);
        void chat.onSelectConversation(id);
      }}
      onNewChat={() => {
        setSourcesPanel(null);
        void chat.onNewChat();
      }}
      onRename={chat.onRenameChat}
      onDelete={chat.onDeleteChat}
    />
  );

  return (
    <div className={`kb-qa-page${isMobile ? ' kb-qa-page--mobile' : ''}`}>
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
                  onClick={goToAgent}
                  aria-label={t('chat.backAria')}
                >
                  <ArrowLeft size={18} />
                  <span className="ds-compact-label">{t('chat.backToKb')}</span>
                </button>
                <span className="kb-qa-mobile-title" title={kb.name}>
                  {kb.name}
                </span>
              </>
            }
            actions={
              <>
                <button
                  type="button"
                  className={`kb-qa-mobile-chrome-btn${sessionsOpen ? ' is-active' : ''}`}
                  onClick={() => setSessionsOpen((o) => !o)}
                  aria-expanded={sessionsOpen}
                  aria-controls="kb-qa-sessions-drawer"
                  aria-label={t('chat.chatsAria')}
                >
                  <MessageSquare size={18} aria-hidden />
                  <span className="ds-compact-label">{t('chat.chatsLabel')}</span>
                </button>
                <button
                  type="button"
                  className={`kb-qa-mobile-chrome-btn${filesOpen ? ' is-active' : ''}`}
                  onClick={() => setFilesOpen((v) => !v)}
                  aria-expanded={filesOpen}
                  aria-controls="kb-qa-files-rail"
                  aria-label={t('chat.files')}
                >
                  <FolderTree size={18} aria-hidden />
                  <span className="ds-compact-label">{t('chat.files')}</span>
                </button>
              </>
            }
          />
        ) : null}

        <div className="kb-qa-shell-body" ref={shellBodyRef}>
          {isMobile ? (
            <div
              id="kb-qa-sessions-drawer"
              className={`kb-qa-sessions-drawer${sessionsOpen ? ' is-open' : ''}`}
              aria-hidden={!sessionsOpen}
            >
              {sidebar}
            </div>
          ) : (
            sidebar
          )}

          <main className="kb-qa-main">
            <div className="kb-qa-main-scroll" ref={chat.kbQaMainScrollRef}>
              {chat.chatMessages.length === 0 && !chat.qaLoading ? (
                <div className="kb-qa-hero">
                  <div className="kb-qa-hero-mark" aria-hidden>
                    <Sparkles size={28} strokeWidth={1.75} />
                  </div>
                  <h1 className="kb-qa-hero-title">{t('chat.heroTitle', { name: kb.name })}</h1>
                  <p className="kb-qa-hero-sub">{t('chat.heroSubtitle')}</p>
                </div>
              ) : null}

              {chat.chatMessages.length > 0 ? (
                <div className="kb-qa-thread kb-qa-messages kb-qa-messages--fullpage">
                  {chat.chatMessages.map((msg, i) => {
                    const isLast = i === chat.chatMessages.length - 1;
                    return (
                      <div
                        key={msg.id ?? `msg-fp-${i}`}
                        className={`kb-qa-msg kb-qa-msg-${msg.role}`}
                      >
                        <span className="kb-qa-msg-label">
                          {msg.role === 'user' ? t('chat.labelYou') : t('chat.labelAssistant')}
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
                          chat.qaLoading &&
                          isLast ? (
                          <div className="kb-qa-msg-bubble kb-qa-msg-bubble--assistant kb-qa-typing">
                            {t('chat.thinking')}
                          </div>
                        ) : (
                          <div
                            className={
                              msg.role === 'user'
                                ? 'kb-qa-msg-bubble kb-qa-msg-bubble--user'
                                : 'kb-qa-msg-bubble kb-qa-msg-bubble--assistant'
                            }
                          >
                            <AgentMessageBody
                              text={msg.content}
                              variant={msg.role === 'user' ? 'user' : 'assistant'}
                            />
                          </div>
                        )}
                        {msg.role === 'assistant' &&
                          !(chat.qaLoading && isLast) &&
                          (() => {
                            const assistantText = chat.assistantText(msg);
                            const { evidence, references } = splitQaSources(msg.sources ?? []);
                            const hasSources = evidence.length > 0 || references.length > 0;
                            const showFeedback = Boolean(assistantText);
                            const warnings = msg.warnings ?? [];
                            if (!hasSources && !showFeedback && warnings.length === 0) return null;
                            const feedbackKey = chatFeedbackKey(msg, i);
                            const feedback = chat.qaFeedback[feedbackKey];
                            const prev = chat.chatMessages[i - 1];
                            const question = prev?.role === 'user' ? prev.content.trim() : '';
                            const rk = msg.replyKey ?? `legacy-${i}`;
                            const sourcesOpen = sourcesPanel?.replyKey === rk;
                            return (
                              <div className="kb-qa-msg-actions">
                                {warnings.length > 0 ? (
                                  /* What the agent could not source. Shown, not hidden: the reader decides
                                     whether to trust the numbers, and the source asked to be told. */
                                  <ul className="kb-qa-grounding-warning" role="status">
                                    {warnings.map((w) => (
                                      <li key={w}>{w}</li>
                                    ))}
                                  </ul>
                                ) : null}
                                {hasSources ? (
                                  <ChatSourcesPill
                                    evidenceCount={evidence.length}
                                    referenceCount={references.length}
                                    open={sourcesOpen}
                                    t={t}
                                    onClick={() =>
                                      setSourcesPanel((prevPanel) =>
                                        prevPanel?.replyKey === rk
                                          ? null
                                          : { replyKey: rk, evidence, references }
                                      )
                                    }
                                  />
                                ) : null}
                                {showFeedback ? (
                                  <div className="kb-qa-msg-feedback">
                                    <button
                                      type="button"
                                      className={`kb-qa-feedback-btn kb-qa-feedback-btn--up${
                                        feedback === 'up' ? ' kb-qa-feedback-btn--active' : ''
                                      }`}
                                      aria-label={t('chat.feedbackUpAria')}
                                      aria-pressed={feedback === 'up'}
                                      onClick={() => chat.setFeedbackVote(feedbackKey, 'up')}
                                    >
                                      <ThumbsUp size={16} strokeWidth={2} aria-hidden />
                                    </button>
                                    <button
                                      type="button"
                                      className={`kb-qa-feedback-btn kb-qa-feedback-btn--down${
                                        feedback === 'down' ? ' kb-qa-feedback-btn--active' : ''
                                      }`}
                                      aria-label={t('chat.feedbackDownAria')}
                                      aria-pressed={feedback === 'down'}
                                      onClick={() => chat.setFeedbackVote(feedbackKey, 'down')}
                                    >
                                      <ThumbsDown size={16} strokeWidth={2} aria-hidden />
                                    </button>
                                    {feedback === 'up' && question ? (
                                      <button
                                        type="button"
                                        className="kb-qa-sources-action-btn"
                                        aria-label={t('chat.saveAsFaqAria')}
                                        onClick={() => openFaqFromAnswer(question, assistantText)}
                                      >
                                        {t('chat.saveAsFaq')}
                                      </button>
                                    ) : null}
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
              <form className="kb-qa-composer" onSubmit={chat.handleAsk}>
                <textarea
                  className="kb-qa-composer-input"
                  placeholder={t('chat.placeholder')}
                  value={chat.qaInput}
                  onChange={(e) => chat.setQaInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                    }
                  }}
                  disabled={chat.qaLoading || !chat.kbQaConvReady}
                  rows={1}
                  autoComplete="off"
                  aria-label={t('chat.placeholder')}
                />
                <button
                  type="submit"
                  className="kb-qa-composer-send"
                  disabled={chat.qaLoading || !chat.qaInput.trim() || !chat.kbQaConvReady}
                  aria-label={t('chat.sendAria')}
                >
                  <ArrowUp size={18} strokeWidth={2.25} aria-hidden />
                </button>
              </form>
              <p className="kb-qa-composer-hint">{t('chat.composerHint')}</p>
            </div>
          </main>

          {/* The conversation's files, as the project agent has them: a rail on the right that can be hidden. */}
          <ChatFilesRail
            kbId={kb.id}
            sessionId={chat.qaSessionId}
            open={filesOpen}
            onOpen={() => setFilesOpen(true)}
            onCollapse={() => setFilesOpen(false)}
            isMobile={isMobile}
            containerRef={shellBodyRef}
            suppressToggle={sourcesPanel !== null}
          />
          <ChatSourcesDrawer panel={sourcesPanel} onClose={() => setSourcesPanel(null)} t={t} />
        </div>
      </div>

      {/* Saving an answer as a knowledge-base FAQ — the one action that leaves the conversation. It is
          deliberately not the FAQs tab's editor: that one is built for curating the corpus, this one for
          keeping an answer worth keeping. */}
      <Dialog
        open={faqOpen}
        onClose={closeFaq}
        title={tk('detail.faqDialogSaveFromQa')}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={closeFaq}>
              {tk('detail.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!faqQuestion.trim() || !faqAnswer.trim()}
              onClick={() => void saveFaq()}
            >
              {tk('detail.create')}
            </button>
          </>
        }
      >
        <p className="ds-field__hint">{tk('detail.faqDialogSaveFromQaHint')}</p>
        <FormField label={tk('detail.question')}>
          <input
            className="ds-control"
            value={faqQuestion}
            onChange={(e) => setFaqQuestion(e.target.value)}
          />
        </FormField>
        <FormField label={tk('detail.answer')}>
          <textarea
            className="ds-control"
            rows={6}
            value={faqAnswer}
            onChange={(e) => setFaqAnswer(e.target.value)}
          />
        </FormField>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={faqPolishing || !faqQuestion.trim() || !faqAnswer.trim()}
          onClick={() => void polishFaq()}
        >
          {tk('detail.faqPolishAnswerAria')}
        </button>
      </Dialog>
    </div>
  );
}
