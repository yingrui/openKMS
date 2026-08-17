import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  fetchOntologyAppDesign,
  postOntologyAppDesignerChatStream,
  publishOntologyApp,
  synthesizeOntologyApp,
  unpublishOntologyApp,
  updateOntologyApp,
  type OntologyAppDesignResponse,
} from '../../data/ontologyAppsApi';
import { OntologyAppA2uiSurface } from '../apps/OntologyAppA2uiSurface';
import './AppBuilderPages.scss';

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

  useEffect(() => {
    void (async () => {
      try {
        const design = await fetchOntologyAppDesign(appId);
        setApp(design);
        setWorking(design.a2ui_messages || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [appId]);

  if (error) return <div className="app-builder-page app-builder-page__error">{error}</div>;
  if (!app) return <div className="app-builder-page">{t('loading')}</div>;

  return (
    <div className="app-builder-design">
      <aside className="app-builder-design__chat">
        <h2>{t('designer')}</h2>
        <div className="app-builder-design__log">
          {chatLog.map((m, i) => (
            <div key={i} className={`app-builder-design__msg app-builder-design__msg--${m.role}`}>
              {m.content}
            </div>
          ))}
          {streaming ? <div className="app-builder-design__msg app-builder-design__msg--assistant">{streaming}</div> : null}
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
            void postOntologyAppDesignerChatStream(
              appId,
              next,
              (ev) => {
                if (ev.type === 'delta') setStreaming((s) => s + (ev.t || ''));
                if (ev.type === 'tool_end' && ev.name === 'set_a2ui_messages') {
                  try {
                    const payload = JSON.parse(ev.output) as { ok?: boolean; messages?: Record<string, unknown>[] };
                    if (payload.ok && payload.messages) setWorking(payload.messages);
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
                }
                if (ev.type === 'error') setError(ev.message);
              },
              { workingA2uiMessages: working },
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
      </aside>

      <main className="app-builder-design__canvas">
        <OntologyAppA2uiSurface a2uiMessages={working} />
      </main>

      <aside className="app-builder-design__rail">
        <h2>{t('publishRail')}</h2>
        <p className="app-builder-page__muted">
          {app.status} {app.bindings_stale ? `· ${t('stale')}` : ''}
        </p>
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
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => {
            void updateOntologyApp(appId, { draft_a2ui_messages: working }).then(() =>
              publishOntologyApp(appId, working).then((run) => navigate(`/apps/${run.id}`)),
            );
          }}
        >
          {t('publish')}
        </button>
        {app.status === 'published' ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void unpublishOntologyApp(appId).then(() => fetchOntologyAppDesign(appId).then(setApp))}
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
