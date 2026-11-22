import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeft, ExternalLink, Maximize2, Minimize2, Settings } from 'lucide-react';
import { fetchChamberRun, chamberAppProxyUrl, type ChamberRunResponse } from '../../data/chamberApi';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTheme } from '../../hooks/useDocumentTheme';
import './ChamberPages.scss';

const EXIT_BTN_MARGIN = 12;
const DRAG_THRESHOLD_PX = 4;
const PROBE_TIMEOUT_MS = 8000;

/** Why the app did not answer. The proxy already knows; until now that knowledge stopped at an HTTP status. */
type ProbeFailure = 'unreachable' | 'bindings' | 'auth' | 'missing' | 'unknown';
type Probe =
  | { kind: 'checking' }
  | { kind: 'ok' }
  | { kind: 'failed'; reason: ProbeFailure; status?: number };

/**
 * One `HEAD` through the proxy before the frame is trusted with the page.
 *
 * `HEAD` because the probe must not fetch (or render, or side-effect) the app: the proxy answers the app's own
 * status, so 405 still means "reachable". A 502/504 is the proxy saying it could not reach the Service, 400 is its
 * bindings check, 401/403 is this platform refusing the request, 404 is "not registered" — or the app's own 404 at
 * its root, which the message says out loud rather than guessing.
 */
async function probeService(appId: string): Promise<Probe> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const resp = await fetch(chamberAppProxyUrl(appId), {
      method: 'HEAD',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (resp.status === 502 || resp.status === 504) {
      return { kind: 'failed', reason: 'unreachable', status: resp.status };
    }
    if (resp.status === 400) return { kind: 'failed', reason: 'bindings', status: resp.status };
    if (resp.status === 401 || resp.status === 403) {
      return { kind: 'failed', reason: 'auth', status: resp.status };
    }
    if (resp.status === 404) return { kind: 'failed', reason: 'missing', status: resp.status };
    return { kind: 'ok' };
  } catch {
    return { kind: 'failed', reason: 'unknown' };
  } finally {
    window.clearTimeout(timer);
  }
}

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

export function ChamberRunPage() {
  const theme = useDocumentTheme();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [initialTheme] = useState(theme);

  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage(
      { type: 'openkms:theme', theme },
      window.location.origin,
    );
  }, [theme]);
  const { appId = '' } = useParams();
  const { t } = useTranslation('chamber');
  const { canAccessPath } = useAuth();
  const canEdit = canAccessPath('/chamber');
  const [app, setApp] = useState<ChamberRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Keyed by the request it answers, so "checking" is derived and the effect never setStates on mount. */
  const [probeResult, setProbeResult] = useState<{ key: string; value: Probe } | null>(null);
  const [probeNonce, setProbeNonce] = useState(0);
  const probeKey = `${appId}:${probeNonce}`;
  const probe: Probe =
    probeResult?.key === probeKey ? probeResult.value : { kind: 'checking' };
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
        setApp(await fetchChamberRun(appId));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [appId]);

  useEffect(() => {
    let alive = true;
    void probeService(appId).then((value) => {
      if (alive) setProbeResult({ key: probeKey, value });
    });
    return () => {
      alive = false;
    };
  }, [appId, probeKey]);

  useLayoutEffect(() => {
    if (!fullscreen) {
      exitPlacedRef.current = false;
      return;
    }
    const btn = exitBtnRef.current;
    if (btn && !exitPlacedRef.current) {
      const rect = btn.getBoundingClientRect();
      setExitBtnPos(bottomRightExitBtnPos(rect.width, rect.height));
      exitPlacedRef.current = true;
    }
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

  // A different app starts windowed (render-time adjustment).
  const [lastAppId, setLastAppId] = useState(appId);
  if (lastAppId !== appId) {
    setLastAppId(appId);
    setFullscreen(false);
    setExitBtnPos(null);
  }

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
      <div className="chamber-page">
        <p className="chamber-page__error">{error}</p>
        <Link to="/chamber">{t('backToGallery')}</Link>
      </div>
    );
  }
  if (!app) return <div className="chamber-page">{t('loading')}</div>;

  return (
    <div
      className={`chamber-page chamber-page--run chamber-page--run-module${fullscreen ? ' chamber-page--run-fullscreen' : ''}`}
    >
      {fullscreen && exitBtnPos ? (
        <button
          ref={exitBtnRef}
          type="button"
          className="chamber-page__fullscreen-exit"
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
        <header className="chamber-page__run-header">
          <Link to="/chamber" className="chamber-page__back">
            <ArrowLeft size={18} aria-hidden />
            <span>{t('backToGallery')}</span>
          </Link>
          <span className="chamber-page__run-title">{app.name}</span>
          <div className="chamber-page__run-actions">
            {/* The frame cannot carry a deep link (its routes never reach the address bar) and cannot carry a
                WebSocket. A real tab can do both, so the escape hatch is one click, not a paragraph. */}
            <a
              href={`${chamberAppProxyUrl(app.id)}?theme=${theme}`}
              target="_blank"
              rel="noreferrer"
              className="chamber-page__icon-btn"
              title={t('openInNewTab')}
              aria-label={t('openInNewTab')}
            >
              <ExternalLink size={16} aria-hidden />
            </a>
            {canEdit ? (
              <Link
                to={`/chamber/${app.id}/settings`}
                className="chamber-page__icon-btn"
                title={t('editSettings')}
                aria-label={t('editSettings')}
              >
                <Settings size={16} aria-hidden />
              </Link>
            ) : null}
            <button
              type="button"
              className="chamber-page__icon-btn"
              onClick={() => {
                setExitBtnPos(defaultExitBtnPos());
                setFullscreen(true);
              }}
              title={t('fullscreen')}
              aria-label={t('fullscreen')}
            >
              <Maximize2 size={16} aria-hidden />
            </button>
          </div>
        </header>
      )}
      {!fullscreen && app.bindings_stale ? (
        <div className="chamber-page__banner" role="status">
          {t('staleBanner')}
          {canEdit ? <Link to={`/chamber/${app.id}/settings`}>{t('repair')}</Link> : null}
        </div>
      ) : null}

      {probe.kind === 'failed' && probe.reason === 'unknown' ? (
        <p className="chamber-page__probe-note" role="status">
          {t('probeUnknownSoft')}
        </p>
      ) : null}

      {probe.kind === 'failed' && probe.reason !== 'unknown' ? (
        <div className="chamber-page__probe" role="alert">
          <div className="chamber-page__probe-head">
            <AlertTriangle size={18} aria-hidden />
            <h2>{t('probeFailedTitle')}</h2>
            {probe.status ? (
              <span className="chamber-page__probe-status">
                {t('probeStatus', { status: probe.status })}
              </span>
            ) : null}
          </div>
          <p>{t(`probe_${probe.reason}`)}</p>
          <dl className="chamber-page__probe-target">
            <dt>{t('probeTarget')}</dt>
            <dd>{probeTarget(app.bindings?.k8s)}</dd>
          </dl>
          <div className="openkms-flex-row-gap">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setProbeNonce((n) => n + 1)}
            >
              {t('probeRetry')}
            </button>
            {canEdit ? (
              <Link to={`/chamber/${app.id}/settings`} className="btn btn-secondary">
                {t('probeFix')}
              </Link>
            ) : null}
            <Link to="/chamber" className="btn btn-secondary">
              {t('backToGallery')}
            </Link>
          </div>
        </div>
      ) : null}

      <iframe
        key={probeNonce}
        ref={frameRef}
        hidden={probe.kind === 'failed' && probe.reason !== 'unknown'}
        className="chamber-page__module-frame"
        title={t('moduleFrameTitle')}
        src={`${chamberAppProxyUrl(app.id)}?theme=${initialTheme}`}
        onLoad={() =>
          frameRef.current?.contentWindow?.postMessage(
            { type: 'openkms:theme', theme },
            window.location.origin,
          )
        }
      />
      {!fullscreen && probe.kind !== 'failed' ? (
        <p className="chamber-page__frame-hint">{t('wsHint')}</p>
      ) : null}
    </div>
  );
}

/** The binding in one line: enough to fix a typo without opening Settings. */
function probeTarget(k8s: ChamberRunResponse['bindings']['k8s']): string {
  if (!k8s) return '—';
  const path = k8s.path ? `/${String(k8s.path).replace(/^\/+/, '')}` : '';
  return `${k8s.namespace}/${k8s.service}:${k8s.port}${path}`;
}
