import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  createOntologyAppDesignerConversation,
  fetchOntologyAppDesign,
  fetchOntologyAppDesignerSession,
  listOntologyAppDesignerConversations,
  postOntologyAppDesignerChatStream,
  publishOntologyApp,
  synthesizeOntologyApp,
  unpublishOntologyApp,
  updateOntologyApp,
  type DesignerConversation,
  type OntologyAppBindings,
  type OntologyAppDesignResponse,
} from '../../data/ontologyAppsApi';
import { OntologyAppA2uiSurface } from '../apps/OntologyAppA2uiSurface';
import './AppBuilderPages.scss';

function formatBindings(b: OntologyAppBindings | Record<string, unknown> | undefined): string {
  if (!b || !Object.keys(b).length) return '—';
  const lines: string[] = [];
  for (const [k, v] of Object.entries(b)) {
    if (v == null || v === '') continue;
    lines.push(`${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`);
  }
  return lines.length ? lines.join('\n') : '—';
}

export function AppBuilderDesignPage() {
  const { appId = '' } = useParams();
  const { t } = useTranslation('appBuilder');
  const navigate = useNavigate();
  const [app, setApp] = useState<OntologyAppDesignResponse | null>(null);
  const [working, setWorking] = useState<Record<string, unknown>[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLog, setChatLog] = useState<{ role: string; content: string }[]>([]);
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<DesignerConversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const reloadApp = useCallback(async () => {
    const design = await fetchOntologyAppDesign(appId);
    setApp(design);
    setWorking(design.a2ui_messages || []);
    return design;
  }, [appId]);

  useEffect(() => {
    void (async () => {
      try {
        await reloadApp();
        let convs = await listOntologyAppDesignerConversations(appId);
        if (!convs.length) {
          const created = await createOntologyAppDesignerConversation(appId);
          convs = [created];
        }
        setConversations(convs);
        const active = convs[0]?.id ?? null;
        setConversationId(active);
        if (active) {
          const session = await fetchOntologyAppDesignerSession(appId, active);
          setChatLog(
            (session.messages || []).map((m) => ({ role: m.role, content: m.content })),
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [appId, reloadApp]);

  if (error && !app) return <div className="app-builder-page app-builder-page__error">{error}</div>;
  if (!app) return <div className="app-builder-page">{t('loading')}</div>;

  const canPublish = Boolean(app.bindings?.objectType) && !(app.missing_bindings?.length);

  return (
    <div className="app-builder-design">
      <aside className="app-builder-design__chat">
        <div className="app-builder-design__chat-head">
          <h2>{t('designer')}</h2>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => {
              void createOntologyAppDesignerConversation(appId).then(async (c) => {
                setConversations((prev) => [c, ...prev]);
                setConversationId(c.id);
                setChatLog([]);
              });
            }}
          >
            {t('newChat')}
          </button>
        </div>
        {conversations.length > 1 ? (
          <select
            className="app-builder-design__conv-select"
            value={conversationId || ''}
            onChange={(e) => {
              const id = e.target.value || null;
              setConversationId(id);
              if (!id) return;
              void fetchOntologyAppDesignerSession(appId, id).then((session) => {
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
        ) : null}
        <div className="app-builder-design__log">
          {chatLog.map((m, i) => (
            <div key={i} className={`app-builder-design__msg app-builder-design__msg--${m.role}`}>
              {m.content}
            </div>
          ))}
          {streaming ? (
            <div className="app-builder-design__msg app-builder-design__msg--assistant">{streaming}</div>
          ) : null}
        </div>
        <form
          className="app-builder-design__composer"
          onSubmit={(e) => {
            e.preventDefault();
            const text = chatInput.trim();
            if (!text || busy) return;
            const next = [...chatLog, { role: 'user', content: text }];
            setChatLog(next);
            setChatInput('');
            setBusy(true);
            setStreaming('');
            setError(null);
            void postOntologyAppDesignerChatStream(
              appId,
              next,
              (ev) => {
                if (ev.type === 'delta') setStreaming((s) => s + (ev.t || ''));
                if (ev.type === 'tool_end') {
                  try {
                    const payload = JSON.parse(ev.output) as {
                      ok?: boolean;
                      messages?: Record<string, unknown>[];
                      bindings?: OntologyAppBindings;
                      error?: string;
                    };
                    if (payload.ok && payload.messages) setWorking(payload.messages);
                    if (payload.ok && payload.bindings) {
                      setApp((prev) => (prev ? { ...prev, bindings: payload.bindings! } : prev));
                    }
                    if (!payload.ok && payload.error) setError(payload.error);
                  } catch {
                    /* ignore */
                  }
                }
                if (ev.type === 'done') {
                  setChatLog((prev) => [
                    ...prev,
                    { role: 'assistant', content: ev.content || streaming || t('done') },
                  ]);
                  setStreaming('');
                  if (ev.a2ui_messages) setWorking(ev.a2ui_messages);
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
          }}
        >
          <textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={t('chatPlaceholder')}
            rows={3}
          />
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {t('send')}
          </button>
        </form>
        {error ? <p className="app-builder-page__error">{error}</p> : null}
      </aside>

      <main className="app-builder-design__canvas">
        <OntologyAppA2uiSurface a2uiMessages={working} />
      </main>

      <aside className="app-builder-design__rail">
        <h2>{t('publishRail')}</h2>
        <p className="app-builder-page__muted">
          {app.status} {app.bindings_stale ? `· ${t('stale')}` : ''}
        </p>
        <h3 className="app-builder-design__rail-sub">{t('bindings')}</h3>
        <pre className="app-builder-design__bindings">{formatBindings(app.bindings)}</pre>
        {app.missing_bindings?.length ? (
          <p className="app-builder-page__error">
            {t('missing')}: {app.missing_bindings.join(', ')}
          </p>
        ) : null}
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => {
            void synthesizeOntologyApp(appId).then((d) => {
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
            void updateOntologyApp(appId, { draft_a2ui_messages: working })
              .then(() => publishOntologyApp(appId, working))
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
            onClick={() => void unpublishOntologyApp(appId).then(() => reloadApp())}
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
