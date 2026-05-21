import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, ExternalLink, Loader2, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { config } from '../../config';
import {
  deleteTaxonomyMapHtml,
  postTaxonomyMapHtmlDesignerChatStream,
  postTaxonomyMapHtmlPreview,
  postTaxonomyMapHtmlPublish,
  type MapHtmlDesignerMessage,
  type TaxonomyMapHtmlStatus,
} from '../../data/knowledgeMapApi';
import {
  chatDisplayOmitHtmlFenceBody,
  extractArtifactRaw,
  extractStreamingHtmlFenceInner,
} from './knowledgeMapHtmlArtifact';
import './KnowledgeMapHtmlCopilot.css';

type KnowledgeMapHtmlCopilotProps = {
  status: TaxonomyMapHtmlStatus | null;
  statusLoading: boolean;
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
  canWrite,
  onRefreshStatus,
}: KnowledgeMapHtmlCopilotProps) {
  const { t } = useTranslation('knowledgeMap');
  const [lines, setLines] = useState<ChatLine[]>([]);
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

  const mapHtmlPath = '/api/taxonomy/map-html';
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
        const { html } = await postTaxonomyMapHtmlPreview(draftRaw);
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

  const toPayload = useCallback((history: ChatLine[]): MapHtmlDesignerMessage[] => {
    return history.map(({ role, content }) => ({ role, content }));
  }, []);

  const handleSend = async () => {
    const text = draftInput.trim();
    if (!text || !canWrite || sending) return;
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
      await postTaxonomyMapHtmlDesignerChatStream(
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
        { workingHtml: draftRaw, signal: ac.signal },
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
      await postTaxonomyMapHtmlPublish(draftRaw);
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
      await deleteTaxonomyMapHtml();
      toast.success(t('mapHtmlDesignerDeleted'));
      setLines([]);
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
          <Bot className="km-html-copilot__head-icon" size={22} strokeWidth={2} aria-hidden />
          <div>
            <h2 className="km-html-copilot__title">{t('mapHtmlCopilotTitle')}</h2>
          </div>
        </div>

        <div className="km-html-copilot__thread" role="log">
          {lines.map((ln, i) => (
            <div
              key={ln.id}
              className={`km-html-copilot__msg-line km-html-copilot__msg-line--${ln.role}`}
            >
              <div className="km-html-copilot__msg-label">
                {ln.role === 'user' ? t('mapHtmlDesignerYou') : t('mapHtmlDesignerReply')}
              </div>
              <div className="km-html-copilot__msg-body">
                {ln.content ? <span className="km-html-copilot__msg-text">{ln.content}</span> : null}
                {sending && ln.role === 'assistant' && i === lines.length - 1 && !ln.content.trim() ? (
                  <Loader2 className="knowledge-map-spinner km-html-copilot__msg-pending" size={16} aria-hidden />
                ) : null}
              </div>
            </div>
          ))}
          <div ref={threadEndRef} />
        </div>

        <div className="km-html-copilot__composer">
          <textarea
            id="km-html-designer-input"
            className="km-html-copilot__textarea"
            rows={2}
            value={draftInput}
            onChange={(e) => setDraftInput(e.target.value)}
            placeholder={t('mapHtmlDesignerPlaceholder')}
            disabled={!canWrite || sending}
            aria-label={t('mapHtmlDesignerComposerLabel')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <button
            type="button"
            className="btn btn-primary km-html-copilot__send"
            disabled={!canWrite || sending || !draftInput.trim()}
            aria-label={t('mapHtmlDesignerSendAria')}
            onClick={() => void handleSend()}
          >
            {sending ? <Loader2 className="knowledge-map-spinner" size={18} aria-hidden /> : <Send size={18} aria-hidden />}
            <span>{t('mapHtmlDesignerSend')}</span>
          </button>
        </div>

        <div className="km-html-copilot__foot">
          <div className="km-html-copilot__status-row">
            {statusLoading ? <Loader2 className="knowledge-map-spinner" size={16} aria-hidden /> : null}
            <span className="km-html-copilot__status-strong">{t('mapHtmlCopilotStatusLabel')}</span>
            <span>{statusLabel}</span>
          </div>
          <div className="km-html-copilot__actions">
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
    </div>
  );
}
