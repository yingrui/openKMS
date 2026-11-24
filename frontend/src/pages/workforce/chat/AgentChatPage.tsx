import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUp,
  Copy,
  FolderTree,
  MessageSquare,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { polishFAQAnswer, createFAQ, type KnowledgeBaseResponse } from '../../../data/knowledgeBasesApi';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useImmersiveView } from '../../../contexts/ImmersiveShellContext';
import { Dialog, FormField, PanelToolbar } from '../../../styles/design-system';
import { AgentAssistantStreamBody } from '../../../components/agents/AgentAssistantStreamBody';
import { AgentMessageBody } from '../../../components/agents/AgentMessageBody';
import { ChatFilesRail } from './ChatFilesRail';
import { ChatSessionSidebar } from './ChatSessionSidebar';
import { PERSISTED_AGENT_MESSAGE_ID } from '../../../components/agents/agentConstants';
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
/** A message's time, formatted exactly as an Agent Project message formats it ("Nov 23, 04:01 PM"). */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

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
  useImmersiveView('openkms-agent-chat', true);

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
      conversations={chat.conversations}
      activeId={chat.activeConversationId}
      loading={chat.conversationsLoading}
      disabled={chat.sending}
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
    <div className={`agent-chat-page${isMobile ? ' agent-chat-page--mobile' : ''}`}>
      <div className="agent-chat-shell">
        {isMobile ? (
          <PanelToolbar
            as="div"
            className="agent-chat-mobile-toolbar"
            leading={
              <>
                <button
                  type="button"
                  className="agent-chat-mobile-back"
                  onClick={goToAgent}
                  aria-label={t('chat.backAria')}
                >
                  <ArrowLeft size={18} />
                  <span className="ds-compact-label">{t('chat.backToKb')}</span>
                </button>
                <span className="agent-chat-mobile-title" title={kb.name}>
                  {kb.name}
                </span>
              </>
            }
            actions={
              <>
                <button
                  type="button"
                  className={`agent-chat-mobile-chrome-btn${sessionsOpen ? ' is-active' : ''}`}
                  onClick={() => setSessionsOpen((o) => !o)}
                  aria-expanded={sessionsOpen}
                  aria-controls="agent-chat-sessions-drawer"
                  aria-label={t('chat.chatsAria')}
                >
                  <MessageSquare size={18} aria-hidden />
                  <span className="ds-compact-label">{t('chat.chatsLabel')}</span>
                </button>
                <button
                  type="button"
                  className={`agent-chat-mobile-chrome-btn${filesOpen ? ' is-active' : ''}`}
                  onClick={() => setFilesOpen((v) => !v)}
                  aria-expanded={filesOpen}
                  aria-controls="agent-chat-files-rail"
                  aria-label={t('chat.files')}
                >
                  <FolderTree size={18} aria-hidden />
                  <span className="ds-compact-label">{t('chat.files')}</span>
                </button>
              </>
            }
          />
        ) : null}

        <div className="agent-chat-shell-body" ref={shellBodyRef}>
          {isMobile ? (
            <div
              id="agent-chat-sessions-drawer"
              className={`agent-chat-sessions-drawer${sessionsOpen ? ' is-open' : ''}`}
              aria-hidden={!sessionsOpen}
            >
              {sidebar}
            </div>
          ) : (
            sidebar
          )}

          <main className="agent-chat-main">
            <div
              className="agent-chat-main-scroll"
              ref={chat.mainScrollRef}
              onScroll={(e) => {
                // At the very top there is more thread above: fetch it before the reader reaches the edge.
                if (e.currentTarget.scrollTop < 80 && chat.hasOlder && !chat.loadingOlder) {
                  void chat.loadOlderMessages();
                }
              }}
            >
              {chat.chatMessages.length === 0 && !chat.sending ? (
                <div className="agent-chat-hero">
                  <div className="agent-chat-hero-mark" aria-hidden>
                    <Sparkles size={28} strokeWidth={1.75} />
                  </div>
                  <h1 className="agent-chat-hero-title">{t('chat.heroTitle', { name: kb.name })}</h1>
                  <p className="agent-chat-hero-sub">{t('chat.heroSubtitle')}</p>
                </div>
              ) : null}

              {chat.chatMessages.length > 0 ? (
                <div className="agent-chat-thread agent-chat-messages agent-chat-messages--fullpage">
                  {chat.loadingOlder ? (
                    <p className="agent-chat-older-hint">{t('chat.loadingOlder')}</p>
                  ) : null}
                  {chat.chatMessages.map((msg, i) => {
                    const isLast = i === chat.chatMessages.length - 1;
                    return (
                      <div
                        key={msg.id ?? `msg-fp-${i}`}
                        className={`agent-chat-msg agent-chat-msg-${msg.role}`}
                      >
                        {msg.role === 'assistant' && msg.streamParts && msg.streamParts.length > 0 ? (
                          <div className="agent-chat-assistant-stream">
                            <AgentAssistantStreamBody
                              streamParts={msg.streamParts}
                              fallbackText={msg.content}
                            />
                          </div>
                        ) : msg.role === 'assistant' &&
                          !msg.content &&
                          !(msg.streamParts && msg.streamParts.length) &&
                          chat.sending &&
                          isLast ? (
                          <div className="agent-chat-msg-bubble agent-chat-msg-bubble--assistant agent-chat-typing">
                            {t('chat.thinking')}
                          </div>
                        ) : (
                          <div
                            className={
                              msg.role === 'user'
                                ? 'agent-chat-msg-bubble agent-chat-msg-bubble--user'
                                : 'agent-chat-msg-bubble agent-chat-msg-bubble--assistant'
                            }
                          >
                            <AgentMessageBody
                              text={msg.content}
                              variant={msg.role === 'user' ? 'user' : 'assistant'}
                            />
                          </div>
                        )}
                        {msg.role === 'user' ? (
                          <div className="agent-chat-msg-meta">
                            {msg.createdAt ? (
                              <span className="agent-chat-msg-time">{formatTime(msg.createdAt)}</span>
                            ) : null}
                            {PERSISTED_AGENT_MESSAGE_ID.test(msg.id ?? '') ? (
                              <button
                                type="button"
                                className="agent-chat-revert"
                                title={t('chat.revertTitle')}
                                aria-label={t('chat.revertAria')}
                                disabled={chat.sending}
                                onClick={() => {
                                  void chat.revertMessage(msg).then((text) => {
                                    if (text !== null) chat.setDraft(text);
                                  });
                                }}
                              >
                                <RefreshCw size={13} strokeWidth={2} aria-hidden />
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                        {msg.role === 'assistant' &&
                          !(chat.sending && isLast) &&
                          (() => {
                            const assistantText = chat.assistantText(msg);
                            const { evidence, references } = splitQaSources(msg.sources ?? []);
                            const hasSources = evidence.length > 0 || references.length > 0;
                            const showFeedback = Boolean(assistantText);
                            const warnings = msg.warnings ?? [];
                            if (!hasSources && !showFeedback && warnings.length === 0) return null;
                            const feedbackKey = chatFeedbackKey(msg, i);
                            const feedback = chat.feedback[feedbackKey];
                            const prev = chat.chatMessages[i - 1];
                            const question = prev?.role === 'user' ? prev.content.trim() : '';
                            const rk = msg.replyKey ?? `legacy-${i}`;
                            const sourcesOpen = sourcesPanel?.replyKey === rk;
                            return (
                              <>
                              {warnings.length > 0 || hasSources ? (
                              <div className="agent-chat-msg-evidence">
                                {warnings.length > 0 ? (
                                  <ul className="agent-chat-grounding-warning" role="status">
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
                              </div>
                              ) : null}
                              <div className="agent-chat-msg-actions">
                                {msg.createdAt ? (
                                  <span className="agent-chat-msg-time">
                                    {formatTime(msg.createdAt)}
                                  </span>
                                ) : null}
                                {assistantText ? (
                                  <button
                                    type="button"
                                    className="agent-chat-copy"
                                    title={t('chat.copyAnswer')}
                                    aria-label={t('chat.copyAnswer')}
                                    onClick={() => {
                                      void navigator.clipboard.writeText(assistantText);
                                      toast.success(t('chat.copied'));
                                    }}
                                  >
                                    <Copy size={14} strokeWidth={2} aria-hidden />
                                  </button>
                                ) : null}
                                {showFeedback || assistantText ? (
                                  <div className="agent-chat-msg-feedback">
                                    <button
                                      type="button"
                                      className={`agent-chat-feedback-btn agent-chat-feedback-btn--up${
                                        feedback === 'up' ? ' agent-chat-feedback-btn--active' : ''
                                      }`}
                                      aria-label={t('chat.feedbackUpAria')}
                                      aria-pressed={feedback === 'up'}
                                      onClick={() => chat.setFeedbackVote(feedbackKey, 'up')}
                                    >
                                      <ThumbsUp size={16} strokeWidth={2} aria-hidden />
                                    </button>
                                    <button
                                      type="button"
                                      className={`agent-chat-feedback-btn agent-chat-feedback-btn--down${
                                        feedback === 'down' ? ' agent-chat-feedback-btn--active' : ''
                                      }`}
                                      aria-label={t('chat.feedbackDownAria')}
                                      aria-pressed={feedback === 'down'}
                                      onClick={() => chat.setFeedbackVote(feedbackKey, 'down')}
                                    >
                                      <ThumbsDown size={16} strokeWidth={2} aria-hidden />
                                    </button>
                                    {question ? (
                                      /* Appears while the reader is over the votes; it stays as long as the pointer is
                                         inside that group, so the button can be reached. */
                                      <button
                                        type="button"
                                        className="agent-chat-save-faq"
                                        aria-label={t('chat.saveAsFaqAria')}
                                        onClick={() => openFaqFromAnswer(question, assistantText)}
                                      >
                                        {t('chat.saveAsFaq')}
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                              </>
                            );
                          })()}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="agent-chat-composer-outer">
              <form className="agent-chat-composer" onSubmit={chat.handleAsk}>
                <textarea
                  className="agent-chat-composer-input"
                  placeholder={t('chat.placeholder')}
                  value={chat.draft}
                  onChange={(e) => {
                    chat.setDraft(e.target.value);
                    const el = e.currentTarget;
                    // Grow with the text: a long question typed into a 24px window is a scrollbar, not a composer.
                    el.style.height = 'auto';
                    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
                  }}
                  onKeyDown={(e) => {
                    // While an IME is composing, Enter belongs to it: committing here would send a half-typed
                    // Chinese/Japanese/Korean message. `keyCode === 229` covers browsers that do not report
                    // `isComposing` on the native event.
                    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                    }
                  }}
                  disabled={chat.sending || !chat.conversationReady}
                  rows={1}
                  autoComplete="off"
                  aria-label={t('chat.placeholder')}
                />
                <button
                  type="submit"
                  className="agent-chat-composer-send"
                  disabled={chat.sending || !chat.draft.trim() || !chat.conversationReady}
                  aria-label={t('chat.sendAria')}
                >
                  <ArrowUp size={18} strokeWidth={2.25} aria-hidden />
                </button>
              </form>
              <p className="agent-chat-composer-hint">{t('chat.composerHint')}</p>
            </div>
          </main>

          {/* The conversation's files, as the project agent has them: a rail on the right that can be hidden. */}
          <ChatFilesRail
            kbId={kb.id}
            sessionId={chat.workspaceSessionId}
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
