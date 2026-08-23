import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageCirclePlus, Trash2 } from 'lucide-react';
import {
  createDesignerConversation,
  deleteDesignerConversation,
  fetchAppDesign,
  fetchDesignerSession,
  listDesignerConversations,
  postDesignerChatStream,
  publishApp,
  synthesizeApp,
  unpublishApp,
  updateApp,
  type AppBuilderBindings,
  type AppBuilderDesignResponse,
  type DesignerConversation,
} from '../../data/appBuilderApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { AppA2uiSurface } from './a2ui/AppA2uiSurface';
import './AppBuilderPages.scss';

function formatResources(b: AppBuilderBindings | Record<string, unknown> | undefined): string {
  if (!b || !Object.keys(b).length) return '—';
  const lines: string[] = [];
  for (const [k, v] of Object.entries(b)) {
    if (v == null || v === '') continue;
    lines.push(`${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`);
  }
  return lines.length ? lines.join('\n') : '—';
}

const REMOVED_A2UI_COMPONENTS = new Set(['OntoKanbanBoard', 'OntoActionForm']);

function a2uiHasRemovedComponent(messages: Record<string, unknown>[]): boolean {
  for (const msg of messages) {
    const upd = msg.updateComponents as { components?: Record<string, unknown>[] } | undefined;
    for (const c of upd?.components || []) {
      if (REMOVED_A2UI_COMPONENTS.has(String(c.component || ''))) return true;
    }
  }
  return false;
}

export function AppBuilderDesignPage() {
  const { appId = '' } = useParams();
  const { t } = useTranslation('appBuilder');
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [app, setApp] = useState<AppBuilderDesignResponse | null>(null);
  const [working, setWorking] = useState<Record<string, unknown>[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLog, setChatLog] = useState<{ role: string; content: string }[]>([]);
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<DesignerConversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [canvasMode, setCanvasMode] = useState<'preview' | 'source'>('preview');
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const streamingRef = useRef('');

  const reloadApp = useCallback(async () => {
    const design = await fetchAppDesign(appId);
    setApp(design);
    setWorking(design.a2ui_messages || []);
    return design;
  }, [appId]);

  useEffect(() => {
    void (async () => {
      try {
        await reloadApp();
        let convs = await listDesignerConversations(appId);
        if (!convs.length) {
          const created = await createDesignerConversation(appId);
          convs = [created];
        }
        setConversations(convs);
        const active = convs[0]?.id ?? null;
        setConversationId(active);
        if (active) {
          const session = await fetchDesignerSession(appId, active);
          setChatLog(
            (session.messages || []).map((m) => ({ role: m.role, content: m.content })),
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [appId, reloadApp]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chatLog, streaming]);

  const sendChat = useCallback(() => {
    const text = chatInput.trim();
    if (!text || busy) return;
    const next = [...chatLog, { role: 'user', content: text }];
    setChatLog(next);
    setChatInput('');
    setBusy(true);
    setStreaming('');
    streamingRef.current = '';
    setError(null);
    void postDesignerChatStream(
      appId,
      next,
      (ev) => {
        if (ev.type === 'delta') {
          streamingRef.current += ev.t || '';
          setStreaming(streamingRef.current);
        }
        if (ev.type === 'tool_end') {
          try {
            const payload = JSON.parse(ev.output) as {
              ok?: boolean;
              messages?: Record<string, unknown>[];
              bindings?: AppBuilderBindings;
              error?: string;
            };
            if (payload.ok && payload.messages) setWorking(payload.messages);
            if (payload.ok && payload.bindings) {
              setApp((prev) => (prev ? { ...prev, bindings: payload.bindings! } : prev));
            }
            if (!payload.ok && payload.error) {
              setError(payload.error);
            }
          } catch {
            /* ignore */
          }
        }
        if (ev.type === 'done') {
          const content = ev.content || streamingRef.current || t('done');
          setChatLog((prev) => [...prev, { role: 'assistant', content }]);
          setStreaming('');
          streamingRef.current = '';
          if (ev.a2ui_messages) {
            setWorking(ev.a2ui_messages);
          }
          if (ev.bindings) {
            setApp((prev) => (prev ? { ...prev, bindings: ev.bindings! } : prev));
          }
          void reloadApp().catch(() => undefined);
        }
        if (ev.type === 'error') setError(ev.message);
      },
      { workingA2uiMessages: working, conversationId },
    )
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  }, [appId, busy, chatInput, chatLog, conversationId, reloadApp, t, working]);

  const onNewChat = useCallback(() => {
    if (busy) return;
    void createDesignerConversation(appId).then((c) => {
      setConversations((prev) => [c, ...prev]);
      setConversationId(c.id);
      setChatLog([]);
      setError(null);
    });
  }, [appId, busy]);

  const onDeleteChat = useCallback(
    async (id: string) => {
      const ok = await confirm({
        title: t('deleteChatTitle'),
        message: t('deleteChatConfirm'),
        confirmLabel: t('delete'),
        cancelLabel: t('cancel'),
        danger: true,
      });
      if (!ok) return;
      try {
        await deleteDesignerConversation(appId, id);
        const next = conversations.filter((c) => c.id !== id);
        setConversations(next);
        if (conversationId === id) {
          const fallback = next[0]?.id ?? null;
          setConversationId(fallback);
          if (fallback) {
            const session = await fetchDesignerSession(appId, fallback);
            setChatLog((session.messages || []).map((m) => ({ role: m.role, content: m.content })));
          } else {
            const created = await createDesignerConversation(appId);
            setConversations([created]);
            setConversationId(created.id);
            setChatLog([]);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [appId, confirm, conversationId, conversations, t],
  );

  if (error && !app) return <div className="app-builder-page app-builder-page__error">{error}</div>;
  if (!app) return <div className="app-builder-page">{t('loading')}</div>;

  const canPublish = Boolean(
    (app.bindings?.objectTypes?.length ||
      app.bindings?.actions?.length ||
      app.bindings?.functions?.length) &&
      !(app.missing_bindings?.length),
  );

  return (
    <div className="app-builder-design">
      <aside className="app-builder-design__chat" aria-label={t('designer')}>
        <div className="app-builder-design__chat-head">
          <div>
            <h2>{t('designer')}</h2>
            <p className="app-builder-design__chat-sub">{t('designerSubtitle')}</p>
          </div>
          <button
            type="button"
            className="app-builder-design__icon-btn"
            disabled={busy}
            title={t('newChat')}
            aria-label={t('newChat')}
            onClick={() => onNewChat()}
          >
            <MessageCirclePlus size={16} aria-hidden />
          </button>
        </div>

        {conversations.length > 0 ? (
          <div className="app-builder-design__chats">
            <label className="sr-only" htmlFor="app-builder-conv-select">
              {t('conversationsAria')}
            </label>
            <select
              id="app-builder-conv-select"
              className="app-builder-design__conv-select"
              value={conversationId || ''}
              disabled={busy}
              onChange={(e) => {
                const id = e.target.value || null;
                setConversationId(id);
                if (!id) return;
                void fetchDesignerSession(appId, id).then((session) => {
                  setChatLog((session.messages || []).map((m) => ({ role: m.role, content: m.content })));
                });
              }}
            >
              {conversations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title || c.id.slice(0, 8)}
                </option>
              ))}
            </select>
            {conversationId ? (
              <button
                type="button"
                className="app-builder-design__icon-btn app-builder-design__icon-btn--danger"
                disabled={busy}
                title={t('deleteChat')}
                aria-label={t('deleteChat')}
                onClick={() => void onDeleteChat(conversationId)}
              >
                <Trash2 size={14} aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="app-builder-design__thread">
          {chatLog.map((m, i) => (
            <div key={i} className={`app-builder-design__msg app-builder-design__msg--${m.role}`}>
              <span className="app-builder-design__msg-label">
                {m.role === 'user' ? t('you') : t('assistant')}
              </span>
              <div className="app-builder-design__msg-body">{m.content}</div>
            </div>
          ))}
          {streaming ? (
            <div className="app-builder-design__msg app-builder-design__msg--assistant app-builder-design__msg--streaming">
              <span className="app-builder-design__msg-label">{t('assistant')}</span>
              <div className="app-builder-design__msg-body">{streaming}</div>
            </div>
          ) : null}
          <div ref={threadEndRef} className="app-builder-design__thread-end" aria-hidden />
        </div>

        <form
          className="app-builder-design__composer"
          onSubmit={(e) => {
            e.preventDefault();
            sendChat();
          }}
        >
          <label className="sr-only" htmlFor="app-builder-composer">
            {t('chatPlaceholder')}
          </label>
          <textarea
            id="app-builder-composer"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChat();
              }
            }}
            placeholder={t('chatPlaceholder')}
            rows={3}
            disabled={busy}
          />
          <div className="app-builder-design__composer-footer">
            <p className="app-builder-design__composer-hint">{t('composerHint')}</p>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !chatInput.trim()}>
              {t('send')}
            </button>
          </div>
          {error ? (
            <p className="app-builder-page__error app-builder-design__composer-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </aside>

      <main className="app-builder-design__canvas">
        <div
          className="app-builder-design__canvas-tabs"
          role="tablist"
          aria-label={t('canvasModeAria')}
        >
          <button
            type="button"
            role="tab"
            className={
              canvasMode === 'preview'
                ? 'app-builder-design__canvas-tab app-builder-design__canvas-tab--active'
                : 'app-builder-design__canvas-tab'
            }
            aria-selected={canvasMode === 'preview'}
            onClick={() => setCanvasMode('preview')}
          >
            {t('preview')}
          </button>
          <button
            type="button"
            role="tab"
            className={
              canvasMode === 'source'
                ? 'app-builder-design__canvas-tab app-builder-design__canvas-tab--active'
                : 'app-builder-design__canvas-tab'
            }
            aria-selected={canvasMode === 'source'}
            onClick={() => setCanvasMode('source')}
          >
            {t('source')}
          </button>
        </div>
        <div className="app-builder-design__canvas-body">
          {canvasMode === 'preview' ? (
            <AppA2uiSurface a2uiMessages={working} />
          ) : (
            <pre className="app-builder-design__source" tabIndex={0}>
              {working.length ? JSON.stringify(working, null, 2) : '[]'}
            </pre>
          )}
        </div>
      </main>

      <aside className="app-builder-design__rail">
        <h2>{t('publishRail')}</h2>
        <p className="app-builder-page__muted">
          {app.status} {app.bindings_stale ? `· ${t('stale')}` : ''}
          {app.artifact_kind ? ` · ${app.artifact_kind}` : ''}
        </p>
        {a2uiHasRemovedComponent(working) ? (
          <p className="app-builder-page__error" role="alert">
            {t('removedComponentsHint')}
          </p>
        ) : null}
        {app.missing_bindings?.includes('legacy_board_bindings') ? (
          <p className="app-builder-page__error" role="alert">
            {t('legacyBoardHint')}
          </p>
        ) : null}
        <p className="app-builder-page__muted">{t('resources')}</p>
        <pre className="app-builder-design__bindings">{formatResources(app.bindings)}</pre>
        {app.missing_bindings?.filter((m) => m !== 'legacy_board_bindings').length ? (
          <p className="app-builder-page__error" role="alert">
            {t('missing')}:{' '}
            {app.missing_bindings.filter((m) => m !== 'legacy_board_bindings').join(', ')}
          </p>
        ) : null}
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => {
            setError(null);
            void synthesizeApp(appId).then((d) => {
              setApp(d);
              setWorking(d.a2ui_messages || []);
            });
          }}
        >
          {t('resetLayout')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !canPublish}
          title={!canPublish ? t('publishNeedsBindings') : undefined}
          onClick={() => {
            void updateApp(appId, { draft_a2ui_messages: working })
              .then(() => publishApp(appId, working))
              .then((run) => navigate(`/apps/${run.id}`))
              .catch((err) => setError(err instanceof Error ? err.message : String(err)));
          }}
        >
          {t('publish')}
        </button>
        {app.status === 'published' ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void unpublishApp(appId).then(() => reloadApp())}
          >
            {t('unpublish')}
          </button>
        ) : null}
        <Link to="/app-builder" className="btn btn-secondary">
          {t('backToList')}
        </Link>
      </aside>
    </div>
  );
}
