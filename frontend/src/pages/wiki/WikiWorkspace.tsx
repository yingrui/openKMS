import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bot, Network, Save, Settings, X } from 'lucide-react';
import { WikiPagesTree } from '../../components/wiki/WikiPagesTree';
import { WikiSpaceAgentPanel } from '../../components/wiki/WikiSpaceAgentPanel';
import { fetchWikiPages, fetchWikiSemanticPageMatches, fetchWikiSpace } from '../../data/wikiSpacesApi';
import type { WikiPageListItem } from '../../data/wikiSpacesApi';
import { WikiSpaceGraphPanel } from './WikiSpaceGraph';
import { WikiPagePanel, type WikiPagePanelHandle } from './WikiPagePanel';
import './WikiPageEditor.scss';
import './WikiWorkspace.scss';

const GRAPH_KEY = 'graph';

const COPILOT_WIDTH_MIN = 400;
const COPILOT_WIDTH_MAX = 720;
/** Keep at least this much horizontal room for tree + editor when Copilot is open. */
const COPILOT_MAIN_RESERVE = 280;

function defaultCopilotWidthPx(): number {
  return COPILOT_WIDTH_MIN;
}

function maxCopilotWidthPx(): number {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  return Math.min(COPILOT_WIDTH_MAX, Math.max(COPILOT_WIDTH_MIN + 40, vw - COPILOT_MAIN_RESERVE));
}

function clampCopilotWidthPx(w: number): number {
  return Math.round(Math.min(maxCopilotWidthPx(), Math.max(COPILOT_WIDTH_MIN, w)));
}

function tabKeyForPage(pageId: string): string {
  return `page:${pageId}`;
}

/** Page tab keys left → right: newer background tabs left, active page right (before Graph). */
function sortPageTabsForBar(openOrder: string[], activePageId: string | undefined, pinActiveRight: boolean): string[] {
  const pageKeys = openOrder.filter((k) => k.startsWith('page:'));
  const idx = (k: string) => openOrder.indexOf(k);
  if (!pinActiveRight || !activePageId) {
    return [...pageKeys].sort((a, b) => idx(b) - idx(a));
  }
  const activeKey = tabKeyForPage(activePageId);
  if (!pageKeys.includes(activeKey)) {
    return [...pageKeys].sort((a, b) => idx(b) - idx(a));
  }
  const inactive = pageKeys.filter((k) => k !== activeKey);
  inactive.sort((a, b) => idx(b) - idx(a));
  return [...inactive, activeKey];
}

export function WikiWorkspace() {
  const { t } = useTranslation('explore');
  const { id: spaceId, pageId: pageIdParam } = useParams<{ id: string; pageId?: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const isGraph = useMemo(() => /\/pages\/graph\/?$/.test(location.pathname), [location.pathname]);

  const activeKey = isGraph ? GRAPH_KEY : pageIdParam ? tabKeyForPage(pageIdParam) : GRAPH_KEY;

  const [openOrder, setOpenOrder] = useState<string[]>(() => {
    if (!spaceId) return [GRAPH_KEY];
    return isGraph ? [GRAPH_KEY] : pageIdParam ? [tabKeyForPage(pageIdParam)] : [GRAPH_KEY];
  });

  const [tabLabels, setTabLabels] = useState<Record<string, string>>({});
  const [panelModes, setPanelModes] = useState<Record<string, 'edit' | 'preview'>>({});
  const [saveBusy, setSaveBusy] = useState(false);
  const [wikiPages, setWikiPages] = useState<WikiPageListItem[]>([]);
  const [pagesLoading, setPagesLoading] = useState(true);
  const [pageTreeFilter, setPageTreeFilter] = useState('');
  const [pageTreeHybridMatches, setPageTreeHybridMatches] = useState<{
    stringIds: ReadonlySet<string>;
    semanticIds: ReadonlySet<string>;
  }>(() => ({ stringIds: new Set(), semanticIds: new Set() }));
  const [pageTreeMatchPending, setPageTreeMatchPending] = useState(false);
  const lastPageIdRef = useRef<string | undefined>(undefined);
  const panelRefMap = useRef<Map<string, WikiPagePanelHandle | null>>(new Map());

  const [spaceName, setSpaceName] = useState<string | null>(null);
  const copilotStorageKey = spaceId ? `openkms_wiki_workspace_copilot_open_v1_${spaceId}` : null;
  const copilotWidthLocalKey = spaceId ? `openkms_wiki_workspace_copilot_width_px_v1_${spaceId}` : null;
  const [wikiCopilotOpen, setWikiCopilotOpen] = useState(false);
  const [copilotWidthPx, setCopilotWidthPx] = useState(defaultCopilotWidthPx);

  useEffect(() => {
    if (!copilotWidthLocalKey) {
      setCopilotWidthPx(defaultCopilotWidthPx());
      return;
    }
    try {
      const raw = localStorage.getItem(copilotWidthLocalKey);
      if (raw != null) {
        const n = parseInt(raw, 10);
        if (Number.isFinite(n)) setCopilotWidthPx(clampCopilotWidthPx(n));
        else setCopilotWidthPx(defaultCopilotWidthPx());
      } else {
        setCopilotWidthPx(defaultCopilotWidthPx());
      }
    } catch {
      setCopilotWidthPx(defaultCopilotWidthPx());
    }
  }, [copilotWidthLocalKey]);

  useEffect(() => {
    const onResize = () => setCopilotWidthPx((w) => clampCopilotWidthPx(w));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!copilotStorageKey) {
      setWikiCopilotOpen(false);
      return;
    }
    try {
      setWikiCopilotOpen(sessionStorage.getItem(copilotStorageKey) === '1');
    } catch {
      setWikiCopilotOpen(false);
    }
  }, [copilotStorageKey]);

  const setCopilotOpenPersist = useCallback(
    (open: boolean) => {
      setWikiCopilotOpen(open);
      if (!copilotStorageKey) return;
      try {
        if (open) sessionStorage.setItem(copilotStorageKey, '1');
        else sessionStorage.removeItem(copilotStorageKey);
      } catch {
        /* ignore */
      }
    },
    [copilotStorageKey]
  );

  const onCopilotResizePointerDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = copilotWidthPx;
      let latest = startW;
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = 'none';
      const onMove = (ev: MouseEvent) => {
        latest = clampCopilotWidthPx(startW - (ev.clientX - startX));
        setCopilotWidthPx(latest);
      };
      const onUp = () => {
        document.body.style.userSelect = prevUserSelect;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        const final = clampCopilotWidthPx(latest);
        setCopilotWidthPx(final);
        if (copilotWidthLocalKey) {
          try {
            localStorage.setItem(copilotWidthLocalKey, String(final));
          } catch {
            /* ignore */
          }
        }
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [copilotWidthPx, copilotWidthLocalKey]
  );

  useEffect(() => {
    if (!spaceId) return;
    let cancelled = false;
    void fetchWikiSpace(spaceId)
      .then((sp) => {
        if (!cancelled) setSpaceName(sp.name);
      })
      .catch(() => {
        if (!cancelled) setSpaceName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  const pageTabKeysForBar = useMemo(
    () => sortPageTabsForBar(openOrder, pageIdParam, !isGraph && !!pageIdParam),
    [openOrder, pageIdParam, isGraph]
  );

  useEffect(() => {
    if (!pageIdParam) return;
    setPanelModes((m) => (m[pageIdParam] !== undefined ? m : { ...m, [pageIdParam]: 'preview' }));
  }, [pageIdParam]);

  useEffect(() => {
    setSaveBusy(false);
  }, [activeKey]);

  useEffect(() => {
    if (!isGraph && pageIdParam) lastPageIdRef.current = pageIdParam;
  }, [isGraph, pageIdParam]);

  useEffect(() => {
    if (!spaceId) return;
    const urlKey = isGraph ? GRAPH_KEY : pageIdParam ? tabKeyForPage(pageIdParam) : null;
    if (!urlKey) return;
    setOpenOrder((prev) => [...prev.filter((k) => k !== urlKey), urlKey]);
  }, [spaceId, isGraph, pageIdParam]);

  useEffect(() => {
    if (!spaceId) return;
    let cancelled = false;
    setPagesLoading(true);
    void fetchWikiPages(spaceId)
      .then((r) => {
        if (!cancelled) setWikiPages(r.items);
      })
      .catch(() => {
        if (!cancelled) setWikiPages([]);
      })
      .finally(() => {
        if (!cancelled) setPagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  useEffect(() => {
    if (!spaceId) return;
    setPageTreeFilter('');
    setPageTreeHybridMatches({ stringIds: new Set(), semanticIds: new Set() });
    setPageTreeMatchPending(false);
  }, [spaceId]);

  useEffect(() => {
    if (!spaceId) return;
    const trimmed = pageTreeFilter.trim();
    let ac: AbortController | null = null;

    if (trimmed.length < 2) {
      setPageTreeMatchPending(false);
      setPageTreeHybridMatches({ stringIds: new Set(), semanticIds: new Set() });
      return;
    }

    const timer = window.setTimeout(() => {
      ac = new AbortController();
      setPageTreeMatchPending(true);
      void fetchWikiSemanticPageMatches(spaceId, trimmed, { signal: ac.signal })
        .then((res) => {
          if (ac?.signal.aborted) return;
          setPageTreeHybridMatches({
            stringIds: new Set(res.string_matched_page_ids),
            semanticIds: new Set(res.semantic_matched_pages.map((p) => p.page_id)),
          });
          setPageTreeMatchPending(false);
        })
        .catch(() => {
          if (ac?.signal.aborted) return;
          setPageTreeHybridMatches({ stringIds: new Set(), semanticIds: new Set() });
          setPageTreeMatchPending(false);
        });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      ac?.abort();
    };
  }, [spaceId, pageTreeFilter]);

  useEffect(() => {
    if (!wikiPages.length) return;
    setTabLabels((prev) => {
      const next = { ...prev };
      for (const p of wikiPages) {
        if (openOrder.includes(tabKeyForPage(p.id)) && next[p.id] == null) next[p.id] = p.path;
      }
      return next;
    });
  }, [wikiPages, openOrder]);

  const onPageMeta = useCallback((pageId: string, path: string) => {
    setTabLabels((prev) => {
      if (prev[pageId] === path) return prev;
      return { ...prev, [pageId]: path };
    });
  }, []);

  const pageIdsInOrder = useMemo(
    () => openOrder.filter((k) => k.startsWith('page:')).map((k) => k.slice(5)),
    [openOrder]
  );

  const activateTab = useCallback(
    (key: string) => {
      if (!spaceId) return;
      if (key === GRAPH_KEY) {
        navigate(`/wikis/${spaceId}/pages/graph`);
        return;
      }
      if (key.startsWith('page:')) {
        const pid = key.slice(5);
        navigate(`/wikis/${spaceId}/pages/${pid}`);
      }
    },
    [navigate, spaceId]
  );

  const closeTab = useCallback(
    (e: React.MouseEvent, key: string) => {
      e.stopPropagation();
      if (!spaceId) return;
      if (key.startsWith('page:')) {
        const pid = key.slice(5);
        setPanelModes((m) => {
          const { [pid]: _, ...rest } = m;
          return rest;
        });
      }
      setOpenOrder((prev) => {
        const next = prev.filter((k) => k !== key);
        if (key.startsWith('page:')) {
          const pid = key.slice(5);
          setTabLabels((labels) => {
            const { [pid]: _, ...rest } = labels;
            return rest;
          });
        }
        if (key !== activeKey) {
          return next.length ? next : [GRAPH_KEY];
        }
        const ordered = sortPageTabsForBar(next, undefined, false);
        const fallback = ordered.length > 0 ? ordered[ordered.length - 1]! : GRAPH_KEY;
        queueMicrotask(() => {
          if (fallback === GRAPH_KEY) navigate(`/wikis/${spaceId}/pages/graph`);
          else if (fallback.startsWith('page:')) navigate(`/wikis/${spaceId}/pages/${fallback.slice(5)}`);
        });
        return next.length ? next : [GRAPH_KEY];
      });
    },
    [activeKey, navigate, spaceId]
  );

  const handleToolbarSave = useCallback(() => {
    if (!pageIdParam) return;
    void panelRefMap.current.get(pageIdParam)?.save();
  }, [pageIdParam]);

  if (!spaceId) {
    return <p className="wiki-page-editor-muted">{t('wiki.pageEditor.missingParams')}</p>;
  }

  const treeCurrentId = isGraph ? undefined : pageIdParam;

  return (
    <div
      className={`wiki-page-editor-outer wiki-workspace-layout wiki-workspace-layout--split${
        !wikiCopilotOpen ? ' wiki-workspace-layout--agent-collapsed' : ''
      }`}
      style={
        wikiCopilotOpen
          ? ({ '--wiki-agent-w': `${clampCopilotWidthPx(copilotWidthPx)}px` } as CSSProperties)
          : undefined
      }
    >
      <div className="wiki-page-editor">
        <div className="wiki-page-editor-shell">
          <WikiPagesTree
            spaceId={spaceId}
            pages={wikiPages}
            currentPageId={treeCurrentId}
            loading={pagesLoading}
            filterText={pageTreeFilter}
            onFilterTextChange={setPageTreeFilter}
            stringMatchIds={pageTreeHybridMatches.stringIds}
            semanticMatchIds={pageTreeHybridMatches.semanticIds}
            pageTreeMatchPending={pageTreeMatchPending}
          />
          <div className="wiki-page-editor-main wiki-workspace-main">
            <div className="wiki-page-editor-toolbar wiki-workspace-toolbar">
              <div className="wiki-workspace-toolbar-tail">
                <div className="wiki-workspace-doc-tabs" role="tablist" aria-label={t('wiki.workspace.openTabsLabel')}>
                  {pageTabKeysForBar.map((key) => {
                    const pid = key.slice(5);
                    const label = tabLabels[pid] ?? `${pid.slice(0, 8)}…`;
                    const active = activeKey === key;
                    return (
                      <div key={key} className={`wiki-workspace-doc-tab${active ? ' wiki-workspace-doc-tab--active' : ''}`}>
                        <button type="button" className="wiki-workspace-doc-tab-btn" onClick={() => activateTab(key)} role="tab" aria-selected={active}>
                          <span className="wiki-workspace-doc-tab-label" title={tabLabels[pid] ?? pid}>
                            {label}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="wiki-workspace-doc-tab-close"
                          aria-label={t('wiki.workspace.closeTab')}
                          onClick={(ev) => closeTab(ev, key)}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className={`wiki-workspace-graph-tab${activeKey === GRAPH_KEY ? ' wiki-workspace-graph-tab--active' : ''}`}
                    onClick={() => activateTab(GRAPH_KEY)}
                    role="tab"
                    aria-selected={activeKey === GRAPH_KEY}
                    title={t('wiki.pageEditor.graphViewTitle')}
                  >
                    <Network size={16} aria-hidden />
                    {t('wiki.pageEditor.graphView')}
                  </button>
                </div>
                <div className="wiki-workspace-toolbar-end">
                  <Link
                    to="/wikis"
                    className="wiki-page-editor-back wiki-workspace-toolbar-icon-link"
                    aria-label={t('wiki.workspace.backToWikiList')}
                    title={t('wiki.workspace.backToWikiListHint')}
                  >
                    <ArrowLeft size={18} aria-hidden />
                  </Link>
                  {!isGraph && pageIdParam && (
                    <div className="wiki-workspace-toolbar-controls">
                      <div className="wiki-page-editor-tabs wiki-workspace-page-modes" role="tablist" aria-label={t('wiki.pageEditor.viewModeTabs')}>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={(panelModes[pageIdParam] ?? 'preview') === 'edit'}
                          className={(panelModes[pageIdParam] ?? 'preview') === 'edit' ? 'active' : undefined}
                          onClick={() => setPanelModes((m) => ({ ...m, [pageIdParam]: 'edit' }))}
                        >
                          {t('wiki.pageEditor.edit')}
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={(panelModes[pageIdParam] ?? 'preview') === 'preview'}
                          className={(panelModes[pageIdParam] ?? 'preview') === 'preview' ? 'active' : undefined}
                          onClick={() => setPanelModes((m) => ({ ...m, [pageIdParam]: 'preview' }))}
                        >
                          {t('wiki.pageEditor.preview')}
                        </button>
                      </div>
                      {(panelModes[pageIdParam] ?? 'preview') === 'edit' && (
                        <button
                          type="button"
                          className="wiki-workspace-save-btn"
                          disabled={saveBusy}
                          onClick={handleToolbarSave}
                        >
                          <Save size={16} aria-hidden />
                          {saveBusy ? t('wiki.pageEditor.saving') : t('wiki.pageEditor.save')}
                        </button>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    className={`wiki-page-editor-back wiki-workspace-toolbar-icon-link${wikiCopilotOpen ? ' wiki-workspace-toolbar-icon-link--active' : ''}`}
                    aria-label={t('wiki.workspace.copilotToggle')}
                    title={t('wiki.workspace.copilotToggleHint')}
                    aria-pressed={wikiCopilotOpen}
                    onClick={() => setCopilotOpenPersist(!wikiCopilotOpen)}
                  >
                    <Bot size={18} aria-hidden />
                  </button>
                  <Link
                    to={`/wikis/${spaceId}/settings`}
                    className="wiki-page-editor-back wiki-workspace-toolbar-icon-link"
                    aria-label={t('wiki.pageEditor.backToSpace')}
                    title={t('wiki.workspace.spaceSettingsHint')}
                  >
                    <Settings size={18} aria-hidden />
                  </Link>
                </div>
              </div>
            </div>

            <div className="wiki-workspace-panes">
              {pageIdsInOrder.map((pid) => {
                const tabActive = activeKey === tabKeyForPage(pid);
                return (
                  <WikiPagePanel
                    key={pid}
                    ref={(h) => {
                      if (h) panelRefMap.current.set(pid, h);
                      else panelRefMap.current.delete(pid);
                    }}
                    spaceId={spaceId}
                    pageId={pid}
                    wikiPages={wikiPages}
                    isActive={tabActive}
                    viewTab={panelModes[pid] ?? 'preview'}
                    onSavingChange={tabActive ? setSaveBusy : undefined}
                    onPageMeta={onPageMeta}
                  />
                );
              })}
              <div
                className={`wiki-workspace-graph-pane${activeKey === GRAPH_KEY ? ' wiki-workspace-graph-pane--active' : ''}`}
                aria-hidden={activeKey !== GRAPH_KEY}
              >
                <div className="wiki-page-editor-graph-panel wiki-workspace-graph-inner">
                  <WikiSpaceGraphPanel
                    spaceId={spaceId}
                    focusPageId={isGraph ? (searchParams.get('focus') ?? lastPageIdRef.current) : lastPageIdRef.current}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {wikiCopilotOpen && spaceId && (
        <div className="wiki-workspace-agent-rail">
          <div
            className="wiki-workspace-agent-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={clampCopilotWidthPx(copilotWidthPx)}
            aria-valuemin={COPILOT_WIDTH_MIN}
            aria-valuemax={maxCopilotWidthPx()}
            aria-label={t('wiki.workspace.copilotResize')}
            title={t('wiki.workspace.copilotResizeHint')}
            onMouseDown={onCopilotResizePointerDown}
          />
          <div className="wiki-workspace-agent-rail-inner">
            <WikiSpaceAgentPanel
              spaceId={spaceId}
              spaceName={spaceName}
              onRequestCollapse={() => setCopilotOpenPersist(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
