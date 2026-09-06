import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  fetchAppDesign,
  publishApp,
  synthesizeApp,
  unpublishApp,
  updateApp,
  type AppBuilderComponent,
  type AppBuilderDesignResponse,
} from '../../data/appBuilderApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { AppA2uiSurface } from './a2ui/AppA2uiSurface';
import { AuthoringJourneyChecklist, type JourneyStepId } from './a2ui/AuthoringJourneyChecklist';
import {
  extractOntoObjectListBindings,
  sourceHasLayoutPrimitives,
} from './a2ui/dataModelInspect';
import { validateAppA2uiMessages } from './a2ui/validate';
import './AppBuilderPages.scss';

const A2UI_CATALOG_ID = 'https://openkms.local/a2ui/catalogs/ontology-app/v1.json';
const A2UI_SURFACE_ID = 'ontology-app';

function newComponentStub(name: string): Record<string, unknown>[] {
  return [
    { version: 'v0.9', createSurface: { surfaceId: A2UI_SURFACE_ID, catalogId: A2UI_CATALOG_ID } },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: A2UI_SURFACE_ID,
        components: [
          { id: 'root', component: 'Column', children: ['title', 'hint'] },
          { id: 'title', component: 'Text', text: name, variant: 'h1' },
          {
            id: 'hint',
            component: 'Text',
            text: 'Set Resources and Loaders in Settings, then compose the layout in Source.',
            variant: 'body',
          },
        ],
      },
    },
  ];
}

const REMOVED_A2UI_COMPONENTS = new Set([
  'OntoKanbanBoard',
  'OntoActionForm',
  'OntoActionButton',
  'OntoFunctionButton',
  'OntoObjectLink',
]);

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
  const [components, setComponents] = useState<AppBuilderComponent[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const dragIndex = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canvasMode, setCanvasMode] = useState<'preview' | 'source' | 'dataModel'>('preview');
  const [dataModelSnapshot, setDataModelSnapshot] = useState<unknown>({});
  const [sourceText, setSourceText] = useState('[]');
  const [sourceDirty, setSourceDirty] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [visitedPreview, setVisitedPreview] = useState(false);

  const activeComponent =
    components.find((c) => c.id === activeId) ?? components[0];
  const activeMessages = activeComponent?.messages ?? [];
  const loadBindings = extractOntoObjectListBindings(activeMessages);
  const keepSurfaceAlive = canvasMode === 'preview' || canvasMode === 'dataModel';

  useEffect(() => {
    if (!appId) return;
    setVisitedPreview(false);
  }, [appId]);

  const reloadApp = useCallback(async () => {
    const design = await fetchAppDesign(appId);
    setApp(design);
    const comps = design.components || [];
    setComponents(comps);
    setActiveId((prev) => {
      if (prev && comps.some((c) => c.id === prev)) return prev;
      const def = comps.find((c) => c.is_default) ?? comps[0];
      return def ? def.id : null;
    });
    return design;
  }, [appId]);

  useEffect(() => {
    void (async () => {
      try {
        await reloadApp();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [appId, reloadApp]);

  const saveComponents = useCallback(
    (next: AppBuilderComponent[]) => {
      setComponents(next);
      void updateApp(appId, { components: next }).catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
    },
    [appId],
  );

  const applyActiveMessages = useCallback(
    (messages: Record<string, unknown>[]) => {
      if (!activeId) return;
      const next = components.map((c) => (c.id === activeId ? { ...c, messages } : c));
      saveComponents(next);
    },
    [activeId, components, saveComponents],
  );

  const setCanvasModeSafe = useCallback((mode: 'preview' | 'source' | 'dataModel') => {
    if (mode !== 'source') {
      setSourceDirty(false);
      setSourceError(null);
    }
    if (mode === 'preview') setVisitedPreview(true);
    setCanvasMode(mode);
  }, []);

  const goJourney = useCallback(
    (id: JourneyStepId) => {
      if (id === 'resources') {
        navigate(`/app-builder/${appId}/settings?tab=resources`);
        return;
      }
      if (id === 'loaders') {
        navigate(`/app-builder/${appId}/settings?tab=loaders`);
        return;
      }
      if (id === 'layout') {
        setCanvasModeSafe('source');
        return;
      }
      if (id === 'preview') {
        setCanvasModeSafe('preview');
        return;
      }
      if (id === 'publish') {
        document.getElementById('app-builder-publish')?.scrollIntoView({ behavior: 'smooth' });
      }
    },
    [appId, navigate, setCanvasModeSafe],
  );

  const saveSource = useCallback(() => {
    try {
      const parsed = JSON.parse(sourceText) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error('Source must be a JSON array of A2UI messages');
      }
      const messages = parsed as Record<string, unknown>[];
      validateAppA2uiMessages(messages);
      applyActiveMessages(messages);
      setSourceDirty(false);
      setSourceError(null);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSourceError(msg);
      setError(msg);
    }
  }, [applyActiveMessages, sourceText]);

  useEffect(() => {
    if (canvasMode !== 'source' || sourceDirty) return;
    setSourceText(JSON.stringify(activeMessages.length ? activeMessages : [], null, 2));
    setSourceError(null);
  }, [canvasMode, activeMessages, sourceDirty, activeId]);

  useEffect(() => {
    setSourceDirty(false);
  }, [activeId]);

  const addComponent = useCallback(() => {
    const name = `${t('newComponent')} ${components.length + 1}`;
    const comp: AppBuilderComponent = {
      id: crypto.randomUUID(),
      name,
      position: components.length,
      is_default: true,
      messages: newComponentStub(name),
    };
    const next = components.map((c) => ({ ...c, is_default: false })).concat(comp);
    setActiveId(comp.id);
    saveComponents(next);
  }, [components, saveComponents, t]);

  const removeComponent = useCallback(
    async (id: string) => {
      if (components.length <= 1) return;
      const target = components.find((c) => c.id === id);
      if (!target) return;
      const ok = await confirm({
        title: t('deleteComponent'),
        message: `${t('deleteComponentConfirm')} ${target.name}`,
        confirmLabel: t('delete'),
        cancelLabel: t('cancel'),
        danger: true,
      });
      if (!ok) return;
      const remaining = components.filter((c) => c.id !== id);
      const wasDefault = target.is_default;
      let next = remaining.map((c, i) => ({ ...c, position: i }));
      if (wasDefault && next.length) {
        next = next.map((c, i) => ({ ...c, is_default: i === 0 }));
      }
      if (activeId === id) setActiveId(next[0]?.id ?? null);
      saveComponents(next);
    },
    [activeId, components, confirm, saveComponents, t],
  );

  const commitRename = useCallback(() => {
    if (!editingId) return;
    const name = editValue.trim();
    if (name) {
      saveComponents(
        components.map((c) => (c.id === editingId ? { ...c, name } : c)),
      );
    }
    setEditingId(null);
  }, [components, editingId, editValue, saveComponents]);

  const reorder = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      const next = [...components];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      saveComponents(next.map((c, i) => ({ ...c, position: i })));
    },
    [components, saveComponents],
  );

  if (error && !app) return <div className="app-builder-page app-builder-page__error">{error}</div>;
  if (!app) return <div className="app-builder-page">{t('loading')}</div>;

  const canPublish = Boolean(
    (app.bindings?.objectTypes?.length ||
      app.bindings?.actions?.length ||
      app.bindings?.functions?.length) &&
      !(app.missing_bindings?.length),
  );

  const resourcesDone = Boolean(
    (app.bindings?.objectTypes?.length ||
      app.bindings?.actions?.length ||
      app.bindings?.functions?.length) &&
      !(app.missing_bindings?.length),
  );
  const journeySteps = [
    { id: 'resources' as const, done: resourcesDone },
    { id: 'loaders' as const, done: loadBindings.length > 0 },
    { id: 'layout' as const, done: sourceHasLayoutPrimitives(activeMessages) },
    { id: 'preview' as const, done: visitedPreview },
    { id: 'publish' as const, done: app.status === 'published' },
  ];

  return (
    <div className="app-builder-design">
      <main className="app-builder-design__canvas">
        <div
          className="app-builder-design__component-tabs"
          role="tablist"
          aria-label={t('componentTabsAria')}
        >
          {components.map((c, i) => (
            <div
              key={c.id}
              className={`app-builder-design__component-tab${c.id === activeId ? ' is-active' : ''}`}
              draggable
              onDragStart={(e) => {
                dragIndex.current = i;
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragIndex.current;
                dragIndex.current = null;
                if (from === null) return;
                reorder(from, i);
              }}
            >
              {editingId === c.id ? (
                <input
                  className="app-builder-design__component-rename"
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  aria-label={t('renameComponent')}
                />
              ) : (
                <button
                  type="button"
                  role="tab"
                  aria-selected={c.id === activeId}
                  className="app-builder-design__component-tab-btn"
                  onClick={() => setActiveId(c.id)}
                  onDoubleClick={() => {
                    setEditingId(c.id);
                    setEditValue(c.name);
                  }}
                  title={`${c.name}${c.is_default ? ` · ${t('defaultComponent')}` : ''}`}
                >
                  {c.name}
                </button>
              )}
              {c.is_default ? (
                <span className="app-builder-design__component-default" title={t('defaultComponent')} aria-hidden>
                  ●
                </span>
              ) : null}
              <button
                type="button"
                className="app-builder-design__component-close"
                aria-label={t('deleteComponent')}
                title={t('deleteComponent')}
                onClick={() => void removeComponent(c.id)}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="app-builder-design__component-add"
            aria-label={t('newComponent')}
            title={t('newComponent')}
            onClick={addComponent}
          >
            +
          </button>
        </div>

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
            onClick={() => setCanvasModeSafe('preview')}
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
            onClick={() => setCanvasModeSafe('source')}
          >
            {t('source')}
          </button>
          <button
            type="button"
            role="tab"
            className={
              canvasMode === 'dataModel'
                ? 'app-builder-design__canvas-tab app-builder-design__canvas-tab--active'
                : 'app-builder-design__canvas-tab'
            }
            aria-selected={canvasMode === 'dataModel'}
            onClick={() => setCanvasModeSafe('dataModel')}
          >
            {t('dataModel')}
          </button>
        </div>
        <div
          className={
            canvasMode === 'preview'
              ? 'app-builder-design__canvas-body app-builder-design__canvas-body--preview'
              : 'app-builder-design__canvas-body'
          }
        >
          {keepSurfaceAlive ? (
            <div
              className={
                canvasMode === 'preview'
                  ? 'app-builder-design__preview-host'
                  : 'app-builder-design__preview-host app-builder-design__preview-host--inert'
              }
              aria-hidden={canvasMode !== 'preview'}
            >
              <AppA2uiSurface
                a2uiMessages={activeMessages}
                onDataModelChange={setDataModelSnapshot}
              />
            </div>
          ) : null}
          {canvasMode === 'source' ? (
            <div className="app-builder-design__source-editor">
              <p className="app-builder-page__muted">{t('sourceEditHint')}</p>
              <div className="app-builder-design__source-toolbar">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={saveSource}
                  disabled={!sourceDirty}
                >
                  {t('sourceSave')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!sourceDirty}
                  onClick={() => {
                    setSourceDirty(false);
                    setSourceText(
                      JSON.stringify(activeMessages.length ? activeMessages : [], null, 2),
                    );
                    setSourceError(null);
                  }}
                >
                  {t('sourceDiscard')}
                </button>
                {sourceDirty ? (
                  <span className="app-builder-page__muted">{t('sourceUnsaved')}</span>
                ) : null}
              </div>
              {sourceError ? (
                <p className="app-builder-page__error" role="alert">
                  {sourceError}
                </p>
              ) : null}
              <textarea
                className="app-builder-design__source-textarea"
                value={sourceText}
                spellCheck={false}
                aria-label={t('source')}
                onChange={(e) => {
                  setSourceText(e.target.value);
                  setSourceDirty(true);
                  setSourceError(null);
                }}
              />
            </div>
          ) : null}
          {canvasMode === 'dataModel' ? (
            <div className="app-builder-design__data-model">
              <p className="app-builder-page__muted">{t('dataModelHint')}</p>
              <h3 className="app-builder-design__data-model-heading">{t('dataModelLive')}</h3>
              <p className="app-builder-page__muted">{t('dataModelLiveHint')}</p>
              <pre className="app-builder-design__source" tabIndex={0}>
                {JSON.stringify(dataModelSnapshot ?? {}, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      </main>

      <aside className="app-builder-design__rail">
        <h2>{t('publishRail')}</h2>
        <p className="app-builder-page__muted">
          {app.status} {app.bindings_stale ? `· ${t('stale')}` : ''}
          {app.app_kind ? ` · ${app.app_kind}` : ''}
        </p>
        <AuthoringJourneyChecklist steps={journeySteps} onGo={goJourney} />
        {error ? (
          <p className="app-builder-page__error" role="alert">
            {error}
          </p>
        ) : null}
        {a2uiHasRemovedComponent(activeMessages) ? (
          <p className="app-builder-page__error" role="alert">
            {t('removedComponentsHint')}
          </p>
        ) : null}
        {app.missing_bindings?.includes('legacy_board_bindings') ? (
          <p className="app-builder-page__error" role="alert">
            {t('legacyBoardHint')}
          </p>
        ) : null}
        {app.missing_bindings?.filter((m) => m !== 'legacy_board_bindings').length ? (
          <p className="app-builder-page__error" role="alert">
            {t('missing')}:{' '}
            {app.missing_bindings.filter((m) => m !== 'legacy_board_bindings').join(', ')}
          </p>
        ) : null}
        <div id="app-builder-publish" className="app-builder-design__rail-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              void synthesizeApp(appId)
                .then((d) => {
                  setApp(d);
                  setComponents(d.components || []);
                  setActiveId(
                    d.components?.find((c) => c.is_default)?.id ?? d.components?.[0]?.id ?? null,
                  );
                })
                .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                .finally(() => setBusy(false));
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
              setBusy(true);
              setError(null);
              void updateApp(appId, { components })
                .then(() => publishApp(appId, components))
                .then((run) => navigate(`/apps/${run.id}`))
                .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                .finally(() => setBusy(false));
            }}
          >
            {t('publish')}
          </button>
          {app.status === 'published' ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void unpublishApp(appId)
                  .then(() => reloadApp())
                  .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                  .finally(() => setBusy(false));
              }}
            >
              {t('unpublish')}
            </button>
          ) : null}
          <Link to="/app-builder" className="btn btn-secondary">
            {t('backToList')}
          </Link>
          <Link to={`/app-builder/${appId}/settings`} className="btn btn-secondary">
            {t('settings')}
          </Link>
        </div>
      </aside>
    </div>
  );
}
