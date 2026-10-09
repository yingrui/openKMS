import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Maximize2, Minimize2 } from 'lucide-react';
import { fetchAppRun, moduleAppProxyUrl, type AppBuilderRunResponse } from '../../data/appBuilderApi';
import { AppA2uiSurface } from '../app-builder/a2ui/AppA2uiSurface';
import { useAuth } from '../../contexts/AuthContext';
import './AppsPages.scss';

const EXIT_BTN_MARGIN = 12;
const DRAG_THRESHOLD_PX = 4;

type ExitBtnPos = { left: number; top: number };

function bottomRightExitBtnPos(width: number, height: number): ExitBtnPos {
  return clampExitBtnPos(
    window.innerWidth - width - EXIT_BTN_MARGIN,
    window.innerHeight - height - EXIT_BTN_MARGIN,
    width,
    height,
  );
}

function defaultExitBtnPos(): ExitBtnPos {
  // Approximate chip size until measured in layout.
  return bottomRightExitBtnPos(168, 36);
}

function clampExitBtnPos(left: number, top: number, width: number, height: number): ExitBtnPos {
  const maxLeft = Math.max(EXIT_BTN_MARGIN, window.innerWidth - width - EXIT_BTN_MARGIN);
  const maxTop = Math.max(EXIT_BTN_MARGIN, window.innerHeight - height - EXIT_BTN_MARGIN);
  return {
    left: Math.min(maxLeft, Math.max(EXIT_BTN_MARGIN, left)),
    top: Math.min(maxTop, Math.max(EXIT_BTN_MARGIN, top)),
  };
}

export function AppsRunPage() {
  const { appId = '' } = useParams();
  const { t } = useTranslation('apps');
  const { canAccessPath } = useAuth();
  const canEdit = canAccessPath('/app-builder');
  const [app, setApp] = useState<AppBuilderRunResponse | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [exitBtnPos, setExitBtnPos] = useState<ExitBtnPos | null>(null);
  const exitBtnRef = useRef<HTMLButtonElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
    moved: boolean;
  } | null>(null);
  const exitPlacedRef = useRef(false);

  useEffect(() => {
    void (async () => {
      try {
        const run = await fetchAppRun(appId);
        setApp(run);
        const comps = run.components || [];
        setActiveId(comps.find((c) => c.is_default)?.id ?? comps[0]?.id ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [appId]);

  useLayoutEffect(() => {
    if (!fullscreen) {
      exitPlacedRef.current = false;
      return;
    }
    if (exitPlacedRef.current) return;
    const el = exitBtnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setExitBtnPos(bottomRightExitBtnPos(rect.width, rect.height));
    exitPlacedRef.current = true;
  }, [fullscreen, exitBtnPos]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    const onResize = () => {
      const el = exitBtnRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setExitBtnPos((prev) =>
        clampExitBtnPos(prev?.left ?? rect.left, prev?.top ?? rect.top, rect.width, rect.height),
      );
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [fullscreen]);

  useEffect(() => {
    setFullscreen(false);
    setExitBtnPos(null);
  }, [appId]);

  const onExitPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const pos = exitBtnPos ?? { left: rect.left, top: rect.top };
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: pos.left,
      originTop: pos.top,
      moved: false,
    };
    el.setPointerCapture(e.pointerId);
  };

  const onExitPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    setExitBtnPos(clampExitBtnPos(drag.originLeft + dx, drag.originTop + dy, rect.width, rect.height));
  };

  const onExitPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!drag.moved) setFullscreen(false);
  };

  if (error) {
    return (
      <div className="apps-page">
        <p className="apps-page__error">{error}</p>
        <Link to="/apps">{t('backToGallery')}</Link>
      </div>
    );
  }
  if (!app) return <div className="apps-page">{t('loading')}</div>;

  const components = app.components || [];
  const active = components.find((c) => c.id === activeId) ?? components[0];
  const isModule = app.app_kind === 'module';

  return (
    <div
      className={`apps-page apps-page--run${isModule ? ' apps-page--run-module' : ''}${fullscreen ? ' apps-page--run-fullscreen' : ''}`}
    >
      {fullscreen && exitBtnPos ? (
        <button
          ref={exitBtnRef}
          type="button"
          className="apps-page__fullscreen-exit"
          style={{ left: exitBtnPos.left, top: exitBtnPos.top }}
          onPointerDown={onExitPointerDown}
          onPointerMove={onExitPointerMove}
          onPointerUp={onExitPointerUp}
          onPointerCancel={onExitPointerUp}
          title={t('exitFullscreenHint')}
          aria-label={t('exitFullscreen')}
        >
          <Minimize2 size={16} aria-hidden />
          <span>{t('exitFullscreen')}</span>
        </button>
      ) : (
        <header className="apps-page__run-header">
          <Link to="/apps" className="apps-page__back">
            {t('backToGallery')}
          </Link>
          <span className="apps-page__run-title">
            {app.name}
            {app.published_version ? ` · v${app.published_version}` : ''}
          </span>
          <div className="apps-page__run-actions">
            <button
              type="button"
              className="apps-page__fullscreen-btn"
              onClick={() => {
                setExitBtnPos(defaultExitBtnPos());
                setFullscreen(true);
              }}
              title={t('fullscreen')}
              aria-label={t('fullscreen')}
            >
              <Maximize2 size={16} aria-hidden />
            </button>
            {canEdit && !isModule ? (
              <Link to={`/app-builder/${app.id}/design`} className="btn btn-secondary">
                {t('editInBuilder')}
              </Link>
            ) : null}
          </div>
        </header>
      )}
      {!fullscreen && app.bindings_stale ? (
        <div className="apps-page__banner" role="status">
          {t('staleBanner')}
          {canEdit && !isModule ? (
            <Link to={`/app-builder/${app.id}/design`}>{t('repair')}</Link>
          ) : null}
        </div>
      ) : null}

      {isModule ? (
        <iframe
          className="apps-page__module-frame"
          title={t('moduleFrameTitle')}
          src={moduleAppProxyUrl(app.id)}
        />
      ) : (
        <>
          {components.length > 1 ? (
            <div className="apps-page__tabs" role="tablist" aria-label={t('componentsAria')}>
              {components.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={active?.id === c.id}
                  className={`apps-page__tab${active?.id === c.id ? ' is-active' : ''}`}
                  onClick={() => setActiveId(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}

          <AppA2uiSurface a2uiMessages={active?.messages ?? []} />
        </>
      )}
    </div>
  );
}
