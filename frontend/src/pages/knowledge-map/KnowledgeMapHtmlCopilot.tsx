import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, ExternalLink, Loader2, MessageCirclePlus, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { config } from '../../config';
import {
  createKnowledgeMapHtmlDesignerConversation,
  deleteKnowledgeMapHtml,
  deleteKnowledgeMapHtmlDesignerConversation,
  fetchKnowledgeMapHtmlDesignerConversations,
  fetchKnowledgeMapHtmlDesignerSession,
  postKnowledgeMapHtmlDesignerChatStream,
  postKnowledgeMapHtmlPreview,
  postKnowledgeMapHtmlPublish,
  type KnowledgeMapHtmlStatus,
  type MapHtmlDesignerConversation,
  type MapHtmlDesignerMessage,
  type MapHtmlDesignerSessionMessage,
} from '../../data/knowledgeMapApi';
import {
  chatDisplayOmitHtmlFenceBody,
  extractArtifactRaw,
  extractStreamingHtmlFenceInner,
} from './knowledgeMapHtmlArtifact';
import './KnowledgeMapHtmlCopilot.scss';

type KnowledgeMapHtmlCopilotProps = {
  status: KnowledgeMapHtmlStatus | null;
  statusLoading: boolean;
  canRead: boolean;
  canWrite: boolean;
  onRefreshStatus: () => Promise<void>;
};

type ChatLine = { id: string; role: 'user' | 'assistant'; content: string };

function lineId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function KnowledgeMapHtmlCopilot({
  status,
  statusLoading,
  canRead,
  canWrite,
  onRefreshStatus,
}: KnowledgeMapHtmlCopilotProps) {
  const { t } = useTranslation('knowledgeMap');
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [conversations, setConversations] = useState<MapHtmlDesignerConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [convBootstrapBusy, setConvBootstrapBusy] = useState(false);
  const [draftInput, setDraftInput] = useState('');
  const [draftRaw, setDraftRaw] = useState<string | null>(null);
  /** Raw HTML inside ```html … ``` shown in iframe immediately (no round-trip). Cleared when hydrated preview replaces it. */
  const [directPreviewHtml, setDirectPreviewHtml] = useState<string | null>(null);
  const [previewSafe, setPreviewSafe] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [draftPreviewLoading, setDraftPreviewLoading] = useState(false);
  /** True after Send until first ```html chunk has inner HTML — avoids stale hydrated iframe during a new reply. */
  const [streamAwaitingFence, setStreamAwaitingFence] = useState(false);
  const [sending, setSending] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishedKey, setPublishedKey] = useState(0);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mapHtmlPath = '/api/knowledge-map/map-html';
  const previewSrc = useMemo(() => {
    const base = config.apiUrl.replace(/\/$/, '');
    return base ? `${base}${mapHtmlPath}` : mapHtmlPath;
  }, []);

  const hasArtifact = status?.has_artifact === true;

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [lines, sending]);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    };
  }, []);

  const loadMessagesIntoState = useCallback((messages: MapHtmlDesignerSessionMessage[]) => {
    setLines(
      messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.role === 'assistant' ? chatDisplayOmitHtmlFenceBody(m.content) : m.content,
      })),
    );
    const lastAsst = [...messages].reverse().find((m) => m.role === 'assistant');
    const art = lastAsst ? extractArtifactRaw(lastAsst.content) : null;
    if (art) {
      setDraftRaw(art);
    } else {
      setDraftRaw(null);
    }
    setDirectPreviewHtml(null);
    setPreviewSafe(null);
    setPreviewError(null);
  }, []);

  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;
    void (async () => {
      setConvBootstrapBusy(true);
      try {
        const list = await fetchKnowledgeMapHtmlDesignerConversations();
        if (cancelled) return;
        let nextList = list;
        let activeId: string | null = list[0]?.id ?? null;
        if (!activeId && canWrite) {
          const created = await createKnowledgeMapHtmlDesignerConversation();
          if (cancelled) return;
          nextList = [created];
          activeId = created.id;
        }
        setConversations(nextList);
        setActiveConversationId(activeId);
        if (activeId) {
          const { messages } = await fetchKnowledgeMapHtmlDesignerSession(activeId);
          if (cancelled) return;
          loadMessagesIntoState(messages);
        } else {
          setLines([]);
          setDraftRaw(null);
          setDirectPreviewHtml(null);
          setPreviewSafe(null);
          setPreviewError(null);
        }
      } catch {
        if (!cancelled) {
          toast.error(t('mapHtmlDesignerConversationsLoadFailed'));
        }
      } finally {
        if (!cancelled) {
          setConvBootstrapBusy(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canRead, canWrite, t, loadMessagesIntoState]);

  const scheduleStreamDraftPreview = useCallback(
    (inner: string | null, fenceClosed: boolean, fenceOpened: boolean) => {
      if (previewDebounceRef.current) {
        clearTimeout(previewDebounceRef.current);
        previewDebounceRef.current = null;
      }
      if (fenceOpened && inner != null && inner.trim()) {
        setDirectPreviewHtml(inner);
        setStreamAwaitingFence(false);
      }
      if (!fenceOpened) {
        setDirectPreviewHtml(null);
      }
      if (fenceClosed) {
        if (inner != null && inner.trim()) {
          setDraftRaw(inner);
        }
        return;
      }
      if (!inner?.trim()) return;
      previewDebounceRef.current = setTimeout(() => {
        previewDebounceRef.current = null;
        setDraftRaw(inner);
      }, 400);
    },
    [],
  );

  useEffect(() => {
    if (!draftRaw?.trim()) {
      setPreviewSafe(null);
      setPreviewError(null);
      setDraftPreviewLoading(false);
      return;
    }
    setPreviewError(null);
    setDraftPreviewLoading(true);
    let cancelled = false;
    void (async () => {
      try {
        const { html } = await postKnowledgeMapHtmlPreview(draftRaw);
        if (!cancelled) {
          setPreviewSafe(html);
          setPreviewError(null);
          setDirectPreviewHtml(null);
        }
      } catch (e) {
        if (!cancelled) {
          setPreviewSafe(null);
          setPreviewError(e instanceof Error ? e.message : t('mapHtmlDesignerPreviewFailed'));
        }
      } finally {
        if (!cancelled) {
          setDraftPreviewLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draftRaw, t]);

  const openInNewTab = () => {
    window.open(previewSrc, '_blank', 'noopener,noreferrer');
  };

  const convSelectValue =
    activeConversationId && conversations.some((c) => c.id === activeConversationId)
      ? activeConversationId
      : '';

  const formatConversationOption = (c: MapHtmlDesignerConversation) => {
    const title = (c.title?.trim() || t('mapHtmlDesignerUntitled')).slice(0, 48);
    const d = new Date(c.updated_at);
    const ds = !Number.isNaN(d.getTime())
      ? d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
      : '';
    return ds ? `${title} · ${ds}` : title;
  };

  const handleSelectConversation = async (nextId: string) => {
    if (!nextId || nextId === activeConversationId || sending || convBootstrapBusy) return;
    streamAbortRef.current?.abort();
    setConvBootstrapBusy(true);
    try {
      setActiveConversationId(nextId);
      const { messages } = await fetchKnowledgeMapHtmlDesignerSession(nextId);
      loadMessagesIntoState(messages);
      setDraftInput('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('mapHtmlDesignerChatSwitchFailed'));
    } finally {
      setConvBootstrapBusy(false);
    }
  };

  const handleNewChat = async () => {
    if (!canWrite || sending || convBootstrapBusy) return;
    streamAbortRef.current?.abort();
    setConvBootstrapBusy(true);
    try {
      const c = await createKnowledgeMapHtmlDesignerConversation();
      setConversations((prev) => [c, ...prev]);
      setActiveConversationId(c.id);
      setLines([]);
      setDraftRaw(null);
      setDirectPreviewHtml(null);
      setPreviewSafe(null);
      setPreviewError(null);
      setDraftInput('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('mapHtmlDesignerNewChatFailed'));
    } finally {
      setConvBootstrapBusy(false);
    }
  };

  const toPayload = useCallback((history: ChatLine[]): MapHtmlDesignerMessage[] => {
    return history.map(({ role, content }) => ({ role, content }));
  }, []);

  const handleSend = async () => {
    const text = draftInput.trim();
    if (!text || !canWrite || sending || convBootstrapBusy) return;
    if (!activeConversationId) {
      toast.error(t('mapHtmlDesignerNoConversation'));
      return;
    }
    streamAbortRef.current?.abort();
    const ac = new AbortController();
    streamAbortRef.current = ac;

    const userLine: ChatLine = { id: lineId('u'), role: 'user', content: text };
    const asstStreamId = lineId('a');
    const historyForPayload: ChatLine[] = [...lines, userLine];
    setLines([...historyForPayload, { id: asstStreamId, role: 'assistant', content: '' }]);
    setDraftInput('');
    setSending(true);
    setStreamAwaitingFence(true);
    setPreviewSafe(null);
    setDirectPreviewHtml(null);

    let acc = '';
    try {
      await postKnowledgeMapHtmlDesignerChatStream(
        toPayload(historyForPayload),
        (e) => {
          if (e.type === 'delta' && e.t) {
            acc += e.t;
            const display = chatDisplayOmitHtmlFenceBody(acc);
            const st = extractStreamingHtmlFenceInner(acc);
            scheduleStreamDraftPreview(st.inner, st.fenceClosed, st.fenceOpened);
            setLines((prev) =>
              prev.map((l) => (l.id === asstStreamId ? { ...l, content: display } : l)),
            );
          }
          if (e.type === 'done') {
            acc = e.content ?? acc;
            if (previewDebounceRef.current) {
              clearTimeout(previewDebounceRef.current);
              previewDebounceRef.current = null;
            }
            const full = (acc || '').trim();
            const display = chatDisplayOmitHtmlFenceBody(full);
            const extracted = extractArtifactRaw(full);
            if (extracted) {
              setDraftRaw(extracted);
              setDirectPreviewHtml(extracted);
            }
            setStreamAwaitingFence(false);
            setLines((prev) =>
              prev.map((l) =>
                l.id === asstStreamId
                  ? {
                      ...l,
                      content: display || t('mapHtmlDesignerArtifactPreviewNote'),
                    }
                  : l,
              ),
            );
          }
          if (e.type === 'error') {
            throw new Error(e.detail);
          }
        },
        { workingHtml: draftRaw, signal: ac.signal, conversationId: activeConversationId },
      );
    } catch (e) {
      const aborted =
        (e instanceof DOMException && e.name === 'AbortError') ||
        (e instanceof Error && e.name === 'AbortError');
      setStreamAwaitingFence(false);
      setDirectPreviewHtml(null);
      setLines((prev) => prev.filter((l) => l.id !== userLine.id && l.id !== asstStreamId));
      if (!aborted) {
        toast.error(e instanceof Error ? e.message : t('mapHtmlDesignerChatFailed'));
      }
    } finally {
      if (streamAbortRef.current === ac) streamAbortRef.current = null;
      setSending(false);
    }
  };

  const handlePublish = async () => {
    if (!draftRaw?.trim() || !canWrite || publishBusy) return;
    setPublishBusy(true);
    try {
      await postKnowledgeMapHtmlPublish(draftRaw);
      toast.success(t('mapHtmlDesignerPublished'));
      setDraftRaw(null);
      setDirectPreviewHtml(null);
      setPreviewSafe(null);
      setPreviewError(null);
      setPublishedKey((k) => k + 1);
      await onRefreshStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('mapHtmlDesignerPublishFailed'));
    } finally {
      setPublishBusy(false);
    }
  };

  const handleDeleteSavedOverview = async () => {
    if (!canWrite) return;
    if (!window.confirm(t('mapHtmlDesignerDeleteConfirm'))) return;
    try {
      await deleteKnowledgeMapHtml();
      toast.success(t('mapHtmlDesignerDeleted'));
      setDraftRaw(null);
      setDirectPreviewHtml(null);
      setPreviewSafe(null);
      setPreviewError(null);
      setPublishedKey((k) => k + 1);
      await onRefreshStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('mapHtmlDesignerDeleteFailed'));
    }
  };

  const handleDeleteConversation = async () => {
    if (!canWrite || !activeConversationId || convBootstrapBusy) return;
    if (!window.confirm(t('mapHtmlDesignerDeleteChatConfirm'))) return;
    streamAbortRef.current?.abort();
    setConvBootstrapBusy(true);
    try {
      const idToRemove = activeConversationId;
      await deleteKnowledgeMapHtmlDesignerConversation(idToRemove);
      const remaining = conversations.filter((x) => x.id !== idToRemove);
      setConversations(remaining);
      if (remaining.length > 0) {
        const pick = remaining[0]!;
        setActiveConversationId(pick.id);
        const { messages } = await fetchKnowledgeMapHtmlDesignerSession(pick.id);
        loadMessagesIntoState(messages);
      } else if (canWrite) {
        const c = await createKnowledgeMapHtmlDesignerConversation();
        setConversations([c]);
        setActiveConversationId(c.id);
        setLines([]);
        setDraftRaw(null);
        setDirectPreviewHtml(null);
        setPreviewSafe(null);
        setPreviewError(null);
      } else {
        setActiveConversationId(null);
        setLines([]);
        setDraftRaw(null);
        setDirectPreviewHtml(null);
        setPreviewSafe(null);
        setPreviewError(null);
      }
      setDraftInput('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('mapHtmlDesignerDeleteChatFailed'));
    } finally {
      setConvBootstrapBusy(false);
    }
  };

  const statusLabel =
    statusLoading && !status
      ? t('mapHtmlCopilotStatusLoading')
      : !status
        ? t('mapHtmlSnapshotUnavailable')
        : !status.has_artifact
          ? t('mapHtmlSnapshotNone')
          : status.stale
            ? t('mapHtmlSnapshotStale')
            : t('mapHtmlSnapshotCurrent');

  const iframeSrcDoc = previewSafe ?? directPreviewHtml;
  const showPublishedIframe =
    !iframeSrcDoc &&
    !previewError &&
    hasArtifact &&
    (streamAwaitingFence || !draftRaw?.trim());
  const previewBadge = previewSafe
    ? t('mapHtmlDesignerPreviewBadgeDraft')
    : directPreviewHtml
      ? t('mapHtmlDesignerPreviewBadgeLive')
      : t('mapHtmlDesignerPreviewBadgePublished');
  const showEmptyHint =
    !iframeSrcDoc &&
    !showPublishedIframe &&
    !draftRaw &&
    !draftPreviewLoading &&
    !(previewError && draftRaw);

  return (
    <div className="km-html-copilot-layout" aria-label={t('mapHtmlCopilotLayoutAria')}>
      <div className="km-html-copilot">
        <div className="km-html-copilot__head">
          <Bot className="km-html-copilot__head-icon" size={20} strokeWidth={2} aria-hidden />
          <div className="km-html-copilot__head-text">
            <h2 className="km-html-copilot__title">{t('mapHtmlCopilotTitle')}</h2>
            <p className="km-html-copilot__sub">{t('mapHtmlCopilotSubtitle')}</p>
          </div>
        </div>

        {canRead ? (
          <div className="km-html-copilot__chats" aria-label={t('mapHtmlDesignerChatsAria')}>
            <label className="km-html-copilot__chats-label" htmlFor="km-html-designer-conversations">
              {t('mapHtmlDesignerChatsLabel')}
            </label>
            {convBootstrapBusy && conversations.length === 0 ? (
              <Loader2 className="knowledge-map-spinner km-html-copilot__chats-spinner" size={16} aria-hidden />
            ) : null}
            <select
              id="km-html-designer-conversations"
              className="km-html-copilot__chats-select"
              disabled={sending || convBootstrapBusy}
              value={convSelectValue}
              onChange={(e) => void handleSelectConversation(e.target.value)}
            >
              {convBootstrapBusy && conversations.length === 0 ? (
                <option value="" disabled>
                  {t('mapHtmlDesignerChatsLoading')}
                </option>
              ) : null}
              {!convBootstrapBusy && conversations.length === 0 ? (
                <option value="" disabled>
                  {t('mapHtmlDesignerChatsEmpty')}
                </option>
              ) : null}
              {conversations.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatConversationOption(c)}
                </option>
              ))}
            </select>
            {canWrite ? (
              <>
                <button
                  type="button"
                  className="km-html-copilot__chats-icon-btn"
                  disabled={sending || convBootstrapBusy}
                  title={t('mapHtmlDesignerNewChatTitle')}
                  aria-label={t('mapHtmlDesignerNewChatAria')}
                  onClick={() => void handleNewChat()}
                >
                  <MessageCirclePlus size={18} strokeWidth={2} aria-hidden />
                </button>
                {activeConversationId ? (
                  <button
                    type="button"
                    className="km-html-copilot__chats-icon-btn km-html-copilot__chats-icon-btn--danger"
                    disabled={sending || convBootstrapBusy}
                    title={t('mapHtmlDesignerDeleteChatTitle')}
                    aria-label={t('mapHtmlDesignerDeleteChatAria')}
                    onClick={() => void handleDeleteConversation()}
                  >
                    <Trash2 size={18} strokeWidth={2} aria-hidden />
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        <div className="km-html-copilot__thread" role="log" aria-live="polite">
          {lines.map((ln, i) => {
            const isThinking =
              sending && ln.role === 'assistant' && i === lines.length - 1 && !ln.content.trim();
            return (
              <div
                key={ln.id}
                className={`km-html-copilot__msg km-html-copilot__msg--${ln.role}${isThinking ? ' km-html-copilot__msg--thinking' : ''}`}
              >
                <span className="km-html-copilot__msg-label">
                  {ln.role === 'user' ? t('mapHtmlDesignerYou') : t('mapHtmlDesignerReply')}
                </span>
                <div className="km-html-copilot__msg-body">
                  {ln.content ? <span className="km-html-copilot__msg-text">{ln.content}</span> : null}
                  {isThinking ? (
                    <Loader2 className="knowledge-map-spinner km-html-copilot__msg-pending" size={16} aria-hidden />
                  ) : null}
                </div>
              </div>
            );
          })}
          <div ref={threadEndRef} className="km-html-copilot__thread-end" aria-hidden />
        </div>

        <div className="km-html-copilot__composer">
          <label htmlFor="km-html-designer-input" className="sr-only">
            {t('mapHtmlDesignerComposerLabel')}
          </label>
          <div className="km-html-copilot__input-wrap">
            <textarea
              id="km-html-designer-input"
              className="km-html-copilot__input"
              rows={3}
              value={draftInput}
              onChange={(e) => setDraftInput(e.target.value)}
              placeholder={t('mapHtmlDesignerPlaceholder')}
              disabled={!canWrite || sending || convBootstrapBusy || !activeConversationId}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  if (e.nativeEvent.isComposing || e.key === 'Process' || e.nativeEvent.keyCode === 229) {
                    return;
                  }
                  e.preventDefault();
                  void handleSend();
                }
              }}
            />
          </div>
          <div className="km-html-copilot__composer-footer">
            <p className="km-html-copilot__composer-hint">{t('mapHtmlDesignerComposerHint')}</p>
            <button
              type="button"
              className="btn btn-primary km-html-copilot__send"
              disabled={!canWrite || sending || convBootstrapBusy || !activeConversationId || !draftInput.trim()}
              aria-label={t('mapHtmlDesignerSendAria')}
              onClick={() => void handleSend()}
            >
              {sending ? (
                <>
                  <Loader2 className="knowledge-map-spinner" size={18} strokeWidth={2} aria-hidden />
                  {t('mapHtmlDesignerSending')}
                </>
              ) : (
                <>
                  <Send size={18} strokeWidth={2} aria-hidden />
                  {t('mapHtmlDesignerSend')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="km-html-copilot-preview">
        <div className="km-html-copilot-preview__head">
          <span>{t('mapHtmlCopilotPreviewHeading')}</span>
          <span className="km-html-copilot-preview__badge">{previewBadge}</span>
        </div>
        <div className="km-html-copilot-preview__body">
          {draftPreviewLoading && !directPreviewHtml ? (
            <div className="km-html-copilot-preview__pending">
              <Loader2 className="knowledge-map-spinner" size={20} aria-hidden />
              <span>{t('mapHtmlDesignerPreviewLoading')}</span>
            </div>
          ) : null}
          {draftPreviewLoading && directPreviewHtml ? (
            <div className="km-html-copilot-preview__pending km-html-copilot-preview__pending--inline">
              <Loader2 className="knowledge-map-spinner" size={14} aria-hidden />
              <span>{t('mapHtmlDesignerPreviewHydrating')}</span>
            </div>
          ) : null}
          {previewError && draftRaw ? (
            <div className="km-html-copilot-preview__empty km-html-copilot-preview__empty--error" role="alert">
              {previewError}
            </div>
          ) : null}
          {iframeSrcDoc ? (
            <iframe
              title={t('mapHtmlCopilotPreviewHeading')}
              className="km-html-copilot-preview__frame"
              srcDoc={iframeSrcDoc}
              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
              referrerPolicy="no-referrer"
            />
          ) : null}
          {showPublishedIframe ? (
            <iframe
              key={publishedKey}
              title={t('mapHtmlCopilotPreviewHeading')}
              className="km-html-copilot-preview__frame"
              src={previewSrc}
              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
              referrerPolicy="no-referrer"
            />
          ) : null}
          {showEmptyHint ? (
            <div className="km-html-copilot-preview__empty">{t('mapHtmlCopilotPreviewEmpty')}</div>
          ) : null}
        </div>
      </div>

      <aside className="km-html-copilot-rail" aria-label={t('mapHtmlSnapshotAria')}>
        <div className="km-html-copilot-rail__head">
          <span>{t('mapHtmlCopilotStatusLabel')}</span>
        </div>
        <div className="km-html-copilot-rail__body">
          <div className="km-html-copilot-rail__status">
            {statusLoading ? <Loader2 className="knowledge-map-spinner" size={16} aria-hidden /> : null}
            <span>{statusLabel}</span>
          </div>
          <div className="km-html-copilot__actions km-html-copilot-rail__actions">
            {hasArtifact ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={openInNewTab}>
                <ExternalLink size={16} aria-hidden />
                {t('mapHtmlSnapshotOpen')}
              </button>
            ) : null}
            {canWrite && hasArtifact ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void handleDeleteSavedOverview()}>
                <Trash2 size={16} aria-hidden />
                {t('mapHtmlDesignerDeleteSaved')}
              </button>
            ) : null}
            {canWrite && draftRaw?.trim() && previewSafe ? (
              <button type="button" className="btn btn-primary btn-sm" disabled={publishBusy} onClick={() => void handlePublish()}>
                {publishBusy ? t('mapHtmlDesignerPublishing') : t('mapHtmlDesignerPublish')}
              </button>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}
