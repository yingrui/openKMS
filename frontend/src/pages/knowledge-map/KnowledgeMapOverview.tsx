import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Loader2, MessageCirclePlus, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createOverviewDesignerConversation,
  deleteKnowledgeMapOverview,
  deleteOverviewDesignerConversation,
  fetchKnowledgeMapOverview,
  fetchOverviewDesignerConversations,
  fetchOverviewDesignerSession,
  postOverviewDesignerChatStream,
  publishKnowledgeMapOverview,
  type OverviewDesignerConversation,
  type OverviewDesignerSessionMessage,
  type OverviewView,
} from '../../data/knowledgeMapApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { KnowledgeMapOverviewA2uiSurface } from './KnowledgeMapOverviewA2uiSurface';
import './KnowledgeMapHtmlCopilot.scss';
import './KnowledgeMapOverview.scss';

type ChatLine = { id: string; role: 'user' | 'assistant'; content: string };

function lineId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type Props = {
  canRead: boolean;
  canWrite: boolean;
};

export function KnowledgeMapOverview({ canRead, canWrite }: Props) {
  const { t } = useTranslation('knowledgeMap');
  const confirm = useConfirm();
  const [view, setView] = useState<OverviewView | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingA2ui, setWorkingA2ui] = useState<Record<string, unknown>[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [conversations, setConversations] = useState<OverviewDesignerConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [convBootstrapBusy, setConvBootstrapBusy] = useState(false);
  const [draftInput, setDraftInput] = useState('');
  const [sending, setSending] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  const refreshView = useCallback(async () => {
    const v = await fetchKnowledgeMapOverview();
    setView(v);
    setWorkingA2ui(v.a2ui_messages);
    setDirty(false);
  }, []);

  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        await refreshView();
      } catch {
        if (!cancelled) toast.error(t('overviewLoadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canRead, refreshView, t]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [lines, sending]);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
    };
  }, []);

  const loadMessagesIntoState = useCallback((messages: OverviewDesignerSessionMessage[]) => {
    setLines(
      messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
      })),
    );
  }, []);

  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;
    void (async () => {
      setConvBootstrapBusy(true);
      try {
        const list = await fetchOverviewDesignerConversations();
        if (cancelled) return;
        let nextList = list;
        let activeId: string | null = list[0]?.id ?? null;
        if (!activeId && canWrite) {
          const created = await createOverviewDesignerConversation();
          if (cancelled) return;
          nextList = [created];
          activeId = created.id;
        }
        setConversations(nextList);
        setActiveConversationId(activeId);
        if (activeId) {
          const { messages } = await fetchOverviewDesignerSession(activeId);
          if (cancelled) return;
          loadMessagesIntoState(messages);
        } else {
          setLines([]);
        }
      } catch {
        if (!cancelled) toast.error(t('overviewDesignerConversationsLoadFailed'));
      } finally {
        if (!cancelled) setConvBootstrapBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canRead, canWrite, t, loadMessagesIntoState]);

  const onSend = async () => {
    const text = draftInput.trim();
    if (!text || !canWrite || sending) return;
    if (!activeConversationId) {
      toast.error(t('overviewDesignerNoConversation'));
      return;
    }
    setDraftInput('');
    const userLine: ChatLine = { id: lineId('u'), role: 'user', content: text };
    const asstId = lineId('a');
    setLines((prev) => [...prev, userLine, { id: asstId, role: 'assistant', content: '' }]);
    setSending(true);
    streamAbortRef.current?.abort();
    const ac = new AbortController();
    streamAbortRef.current = ac;

    const history = [...lines, userLine].map((l) => ({
      role: l.role,
      content: l.content,
    }));

    try {
      await postOverviewDesignerChatStream(
        history,
        (ev) => {
          if (ev.type === 'delta' && ev.t) {
            setLines((prev) =>
              prev.map((l) => (l.id === asstId ? { ...l, content: l.content + ev.t } : l)),
            );
          } else if (ev.type === 'tool_end' && ev.name === 'set_a2ui_messages' && ev.output) {
            try {
              const parsed = JSON.parse(ev.output) as {
                ok?: boolean;
                messages?: Record<string, unknown>[];
              };
              if (parsed.ok && Array.isArray(parsed.messages)) {
                setWorkingA2ui(parsed.messages);
                setDirty(true);
              }
            } catch {
              /* ignore malformed tool output */
            }
          } else if (ev.type === 'done') {
            if (typeof ev.content === 'string' && ev.content) {
              setLines((prev) => prev.map((l) => (l.id === asstId ? { ...l, content: ev.content } : l)));
            }
            if (Array.isArray(ev.a2ui_messages)) {
              setWorkingA2ui(ev.a2ui_messages);
            }
          } else if (ev.type === 'error') {
            toast.error(ev.detail || t('overviewDesignerChatFailed'));
          }
        },
        {
          workingA2uiMessages: workingA2ui,
          conversationId: activeConversationId,
          signal: ac.signal,
        },
      );
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      toast.error(t('overviewDesignerChatFailed'));
    } finally {
      setSending(false);
    }
  };

  const onPublish = async () => {
    if (!workingA2ui?.length || !canWrite) return;
    setPublishBusy(true);
    try {
      await publishKnowledgeMapOverview(workingA2ui);
      toast.success(t('overviewPublished'));
      await refreshView();
    } catch {
      toast.error(t('overviewPublishFailed'));
    } finally {
      setPublishBusy(false);
    }
  };

  const onDeletePublished = async () => {
    if (!canWrite) return;
    const ok = await confirm({
      title: t('overviewDeleteConfirmTitle'),
      message: t('overviewDeleteConfirm'),
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteKnowledgeMapOverview();
      toast.success(t('overviewDeleted'));
      await refreshView();
    } catch {
      toast.error(t('overviewDeleteFailed'));
    }
  };

  const onNewChat = async () => {
    if (!canWrite) return;
    try {
      const created = await createOverviewDesignerConversation();
      setConversations((prev) => [created, ...prev]);
      setActiveConversationId(created.id);
      setLines([]);
    } catch {
      toast.error(t('overviewDesignerNewChatFailed'));
    }
  };

  const onSwitchChat = async (id: string) => {
    setActiveConversationId(id);
    try {
      const { messages } = await fetchOverviewDesignerSession(id);
      loadMessagesIntoState(messages);
    } catch {
      toast.error(t('overviewDesignerChatSwitchFailed'));
    }
  };

  const onDeleteChat = async (id: string) => {
    const ok = await confirm({
      title: t('overviewDesignerDeleteChatTitle'),
      message: t('overviewDesignerDeleteChatConfirm'),
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteOverviewDesignerConversation(id);
      const next = conversations.filter((c) => c.id !== id);
      setConversations(next);
      if (activeConversationId === id) {
        const fallback = next[0]?.id ?? null;
        setActiveConversationId(fallback);
        if (fallback) {
          const { messages } = await fetchOverviewDesignerSession(fallback);
          loadMessagesIntoState(messages);
        } else {
          setLines([]);
        }
      }
    } catch {
      toast.error(t('overviewDesignerDeleteChatFailed'));
    }
  };

  if (loading || !view) {
    return (
      <div className="km-overview-loading">
        <Loader2 className="spin" size={20} aria-hidden />
        <span>{t('loading')}</span>
      </div>
    );
  }

  return (
    <div className="km-overview-layout" aria-label={t('overviewLayoutAria')}>
      <aside className="km-html-copilot">
        <div className="km-html-copilot__head">
          <Bot className="km-html-copilot__head-icon" size={20} aria-hidden />
          <div className="km-html-copilot__head-text">
            <h2 className="km-html-copilot__title">{t('overviewDesignerTitle')}</h2>
            <p className="km-html-copilot__sub">{t('overviewDesignerSubtitleA2ui')}</p>
          </div>
          {canWrite ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onNewChat()} title={t('overviewDesignerNewChat')}>
              <MessageCirclePlus size={16} aria-hidden />
            </button>
          ) : null}
        </div>

        <div className="km-html-copilot__chats" aria-label={t('overviewDesignerChatsAria')}>
          {convBootstrapBusy ? (
            <span className="km-html-copilot__chats-empty">{t('overviewDesignerChatsLoading')}</span>
          ) : conversations.length === 0 ? (
            <span className="km-html-copilot__chats-empty">{t('overviewDesignerChatsEmpty')}</span>
          ) : (
            <div className="km-html-copilot__chats-row">
              <label className="sr-only" htmlFor="km-ov-chat-select">
                {t('overviewDesignerChatsAria')}
              </label>
              <select
                id="km-ov-chat-select"
                className="km-html-copilot__chats-select"
                value={activeConversationId ?? ''}
                onChange={(e) => void onSwitchChat(e.target.value)}
              >
                {conversations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title?.trim() || t('overviewDesignerUntitled')}
                  </option>
                ))}
              </select>
              {canWrite && activeConversationId ? (
                <button
                  type="button"
                  className="km-html-copilot__chats-icon-btn km-html-copilot__chats-icon-btn--danger"
                  aria-label={t('overviewDesignerDeleteChatAria')}
                  onClick={() => void onDeleteChat(activeConversationId)}
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              ) : null}
            </div>
          )}
        </div>

        <div className="km-html-copilot__thread">
          {lines.map((l) => (
            <div key={l.id} className={`km-html-copilot__msg km-html-copilot__msg--${l.role}`}>
              <span className="km-html-copilot__msg-label">
                {l.role === 'user' ? t('overviewDesignerYou') : t('overviewDesignerReply')}
              </span>
              <div className="km-html-copilot__msg-body">
                <span className="km-html-copilot__msg-text">
                  {l.content || (sending && l.role === 'assistant' ? '…' : '')}
                </span>
              </div>
            </div>
          ))}
          <div ref={threadEndRef} className="km-html-copilot__thread-end" aria-hidden />
        </div>

        {canWrite ? (
          <div className="km-html-copilot__composer">
            <label className="sr-only" htmlFor="km-ov-composer">
              {t('overviewDesignerComposerLabel')}
            </label>
            <div className="km-html-copilot__input-wrap">
              <textarea
                id="km-ov-composer"
                className="km-html-copilot__input"
                rows={3}
                value={draftInput}
                disabled={sending}
                placeholder={t('overviewDesignerPlaceholder')}
                onChange={(e) => setDraftInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void onSend();
                  }
                }}
              />
            </div>
            <div className="km-html-copilot__composer-footer">
              <p className="km-html-copilot__composer-hint">{t('mapHtmlDesignerComposerHint')}</p>
              <button
                type="button"
                className="btn btn-primary btn-sm km-html-copilot__send"
                disabled={sending || !draftInput.trim()}
                onClick={() => void onSend()}
              >
                {sending ? <Loader2 className="spin" size={16} aria-hidden /> : <Send size={16} aria-hidden />}
                <span>{t('overviewDesignerSend')}</span>
              </button>
            </div>
          </div>
        ) : null}
      </aside>

      <div className="km-overview-preview">
        <KnowledgeMapOverviewA2uiSurface view={view} a2uiMessages={workingA2ui ?? undefined} />
      </div>

      <aside className="km-html-copilot-rail" aria-label={t('overviewRailAria')}>
        <div className="km-html-copilot-rail__head">{t('overviewStatusLabel')}</div>
        <div className="km-html-copilot-rail__body">
          <div className="km-html-copilot-rail__status">
            <div>
              {!view.has_composition
                ? t('overviewStatusNone')
                : view.stale
                  ? t('overviewStatusStale')
                  : t('overviewStatusCurrent')}
            </div>
            {dirty ? <div className="km-overview-dirty">{t('overviewDraftDirty')}</div> : null}
          </div>
          <div className="km-html-copilot__actions km-html-copilot-rail__actions">
            {canWrite ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!dirty || publishBusy || !workingA2ui?.length}
                  onClick={() => void onPublish()}
                >
                  {publishBusy ? t('overviewPublishing') : t('overviewPublish')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={publishBusy}
                  onClick={() => {
                    void refreshView().catch(() => toast.error(t('overviewLoadFailed')));
                  }}
                >
                  {t('overviewResetCanvas')}
                </button>
                {view.has_composition ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onDeletePublished()}>
                    {t('overviewDeletePublished')}
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}
