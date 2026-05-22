import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { FileStack, Inbox, Loader2, Share2, Waypoints } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useFeatureToggles } from '../contexts/FeatureTogglesContext';
import { useDocumentChannels } from '../contexts/DocumentChannelsContext';
import { HomeStaticLanding } from '../components/HomeStaticLanding';
import { KnowledgeMapForceGraph } from '../components/KnowledgeMapForceGraph';
import { config } from '../config';
import { fetchHomeHub, type HomeHubResponse } from '../data/homeHubApi';
import {
  fetchKnowledgeMapHtmlStatus,
  fetchKnowledgeMapTree,
  fetchResourceLinks,
  type KnowledgeMapHtmlStatus,
  type KnowledgeMapNode,
  type ResourceLink,
} from '../data/knowledgeMapApi';
import { fetchWikiSpaces } from '../data/wikiSpacesApi';
import type { ChannelNode } from '../data/channelUtils';
import './Home.scss';

function flattenDocChannels(nodes: ChannelNode[], prefix = ''): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const n of nodes) {
    out.push({ id: n.id, label: `${prefix}${n.name}` });
    if (n.children?.length) {
      out.push(...flattenDocChannels(n.children, `${prefix}${n.name} / `));
    }
  }
  return out;
}

export function Home() {
  const { t } = useTranslation('home');
  const { isAuthenticated, login, hasPermission } = useAuth();
  const { toggles } = useFeatureToggles();
  const { channels } = useDocumentChannels();
  const navigate = useNavigate();
  const [hub, setHub] = useState<HomeHubResponse | null>(null);
  const [hubError, setHubError] = useState<string | null>(null);
  const [hubLoading, setHubLoading] = useState(false);
  const [knowledgeMapTree, setKnowledgeMapTree] = useState<KnowledgeMapNode[] | null>(null);
  const [resourceLinks, setResourceLinks] = useState<ResourceLink[]>([]);
  const [mapHtmlStatus, setMapHtmlStatus] = useState<KnowledgeMapHtmlStatus | null>(null);
  const [knowledgeMapTreeLoading, setKnowledgeMapTreeLoading] = useState(false);
  const [knowledgeMapTreeError, setKnowledgeMapTreeError] = useState<string | null>(null);
  const [wikiOptions, setWikiOptions] = useState<{ id: string; label: string }[]>([]);

  const loadHub = useCallback(async () => {
    setHubLoading(true);
    setHubError(null);
    try {
      const data = await fetchHomeHub();
      setHub(data);
    } catch (e) {
      setHub(null);
      setHubError(e instanceof Error ? e.message : t('hubLoadError'));
    } finally {
      setHubLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isAuthenticated) void loadHub();
    else {
      setHub(null);
      setHubError(null);
    }
  }, [isAuthenticated, loadHub]);

  const showKnowledgeMapHub =
    toggles.knowledge_map !== false && (hasPermission('knowledge_map:read') || hasPermission('all'));

  useEffect(() => {
    if (!isAuthenticated || !showKnowledgeMapHub) {
      setKnowledgeMapTree(null);
      setResourceLinks([]);
      setMapHtmlStatus(null);
      setKnowledgeMapTreeError(null);
      setKnowledgeMapTreeLoading(false);
      return;
    }
    let cancelled = false;
    setKnowledgeMapTreeLoading(true);
    setKnowledgeMapTreeError(null);
    void (async () => {
      let st: KnowledgeMapHtmlStatus | null = null;
      try {
        st = await fetchKnowledgeMapHtmlStatus();
      } catch {
        st = null;
      }
      if (cancelled) return;
      setMapHtmlStatus(st);
      try {
        const [tree, links] = await Promise.all([fetchKnowledgeMapTree(), fetchResourceLinks()]);
        if (!cancelled) {
          setKnowledgeMapTree(tree);
          setResourceLinks(links);
        }
      } catch (e) {
        if (!cancelled) {
          setKnowledgeMapTree(null);
          setResourceLinks([]);
          setKnowledgeMapTreeError(e instanceof Error ? e.message : t('mapLoadError'));
        }
      } finally {
        if (!cancelled) setKnowledgeMapTreeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, showKnowledgeMapHub, t]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const w = await fetchWikiSpaces();
        if (cancelled) return;
        setWikiOptions(w.items.map((s) => ({ id: s.id, label: s.name })));
      } catch {
        if (!cancelled) setWikiOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const docChannelOptions = useMemo(() => flattenDocChannels(channels), [channels]);
  const channelLabelById = useMemo(() => new Map(docChannelOptions.map((o) => [o.id, o.label])), [docChannelOptions]);
  const wikiLabelById = useMemo(() => new Map(wikiOptions.map((o) => [o.id, o.label])), [wikiOptions]);

  const resolveResourceLabel = useCallback(
    (resourceType: string, resourceId: string) => {
      if (resourceType === 'document_channel') return channelLabelById.get(resourceId) ?? resourceId;
      if (resourceType === 'wiki_space') return wikiLabelById.get(resourceId) ?? resourceId;
      return resourceId;
    },
    [channelLabelById, wikiLabelById],
  );

  const openTermOnMap = useCallback(
    (id: string) => {
      void navigate(`/knowledge-map?node=${encodeURIComponent(id)}`);
    },
    [navigate],
  );

  const mapHtmlIframeSrc = useMemo(() => {
    const base = config.apiUrl.replace(/\/$/, '');
    const path = '/api/knowledge-map/map-html';
    return base ? `${base}${path}` : path;
  }, []);

  if (!isAuthenticated) {
    return <HomeStaticLanding onSignIn={login} />;
  }

  const showKnowledgeMapWrite = hasPermission('knowledge_map:write') || hasPermission('all');
  const showDocsWork = hasPermission('documents:read') || hasPermission('all');
  const mapLoaded = knowledgeMapTree !== null;
  const mapHasTerms = Boolean(knowledgeMapTree?.length);
  const showHtmlHome = mapHtmlStatus?.has_artifact === true;
  const nodeCount = hub?.knowledge_map?.node_count ?? null;
  const linkCount = hub?.knowledge_map?.link_count ?? null;

  return (
    <div className={`home home--hub${showKnowledgeMapHub ? ' home--hub-map-center' : ''}`}>
      {showKnowledgeMapHub ? (
        <>
          <header className="home-map-hero-header">
            <div className="home-map-hero-header-text">
              <h1>{t('title')}</h1>
              <p className="page-subtitle home-map-hero-subtitle">
                {t('subtitleMap')}
              </p>
            </div>
            <div className="home-map-hero-header-aside">
              {nodeCount != null && linkCount != null ? (
                <div className="home-map-hero-stats" aria-live="polite">
                  <span className="home-map-hero-stat">
                    <span className="home-map-hero-stat-value">{nodeCount}</span>
                    <span className="home-map-hero-stat-label">{t('nodes')}</span>
                  </span>
                  <span className="home-map-hero-stat-divider" aria-hidden />
                  <span className="home-map-hero-stat">
                    <span className="home-map-hero-stat-value">{linkCount}</span>
                    <span className="home-map-hero-stat-label">{t('links')}</span>
                  </span>
                </div>
              ) : hubLoading ? (
                <span className="home-muted home-map-hero-stats-muted">{t('loadingOverview')}</span>
              ) : null}
              <Link to="/knowledge-map" className="btn btn-secondary home-map-manage-btn">
                {showKnowledgeMapWrite ? t('editKnowledgeMap') : t('openKnowledgeMap')}
              </Link>
            </div>
          </header>

          {hubError && (
            <p className="home-error home-map-hero-banner" role="alert">
              {hubError}
            </p>
          )}

          <section className="home-map-stage" aria-label={t('sectionKnowledgeMap')}>
            <div className="home-map-stage-title">
              <Waypoints size={22} aria-hidden />
              <span>{showHtmlHome ? t('knowledgeMapPublishedHeading') : t('knowledgeMapHeading')}</span>
            </div>
            {knowledgeMapTreeLoading && !mapLoaded ? (
              <div className="home-map-stage-loading">
                <Loader2 className="home-map-stage-spinner" size={32} aria-hidden />
                <span>{t('loadingGraph')}</span>
              </div>
            ) : knowledgeMapTreeError && !showHtmlHome ? (
              <p className="home-error home-map-stage-error" role="alert">
                {knowledgeMapTreeError}
              </p>
            ) : showHtmlHome ? (
              <iframe
                title={t('knowledgeMapPublishedHeading')}
                className="home-map-stage__html-frame"
                src={mapHtmlIframeSrc}
                sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
                referrerPolicy="no-referrer"
              />
            ) : !mapHasTerms ? (
              <div className="home-map-stage-empty">
                <p className="home-map-stage-empty-title">{t('noNodesTitle')}</p>
                <p className="home-muted">
                  {showKnowledgeMapWrite ? t('noNodesEditor') : t('noNodesViewer')}
                </p>
                {showKnowledgeMapWrite ? (
                  <Link to="/knowledge-map" className="btn btn-primary home-map-stage-empty-cta">
                    {t('goToKnowledgeMap')}
                  </Link>
                ) : null}
              </div>
            ) : knowledgeMapTree ? (
              <KnowledgeMapForceGraph
                tree={knowledgeMapTree}
                links={resourceLinks}
                selectedNodeId={null}
                onSelectNode={openTermOnMap}
                resolveResourceLabel={resolveResourceLabel}
                className="km-map-graph--home"
              />
            ) : null}
            {showHtmlHome ? (
              <p className="home-muted home-map-stage-hint">{t('mapHtmlHint')}</p>
            ) : mapHasTerms ? (
              <p className="home-muted home-map-stage-hint">{t('mapHint')}</p>
            ) : null}
          </section>

          <div className="home-under-map">
            {showDocsWork && (
              <section className="home-hub-card">
                <h2 className="home-hub-card-title">
                  <Inbox size={20} aria-hidden />
                  {t('workItems')}
                </h2>
                <p className="home-muted home-hub-card-intro">
                  {t('workItemsIntro')}
                </p>
                {!hub?.work_items?.length ? (
                  <p className="home-muted">{t('workItemsEmpty')}</p>
                ) : (
                  <ul className="home-work-list">
                    {hub.work_items.map((w) => (
                      <li key={w.id} className="home-work-item">
                        <span className="home-work-type">{w.relation_type}</span>
                        <Link to={`/documents/view/${w.source_document_id}`} className="home-work-link">
                          {w.source_title}
                        </Link>
                        <span className="home-work-arrow" aria-hidden>
                          →
                        </span>
                        <Link to={`/documents/view/${w.target_document_id}`} className="home-work-link">
                          {w.target_title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <div className="home-under-map-row">
              <section className="home-hub-card home-hub-card--compact">
                <h2 className="home-hub-card-title">
                  <Share2 size={20} aria-hidden />
                  {t('shareRequests')}
                </h2>
                <p className="home-muted">{t('shareRequestsEmpty')}</p>
              </section>

              <section className="home-hub-card home-hub-card--compact">
                <h2 className="home-hub-card-title">
                  <FileStack size={20} aria-hidden />
                  {t('browseContent')}
                </h2>
                <ul className="home-quick-links">
                  <li>
                    <Link to="/documents">{t('linkDocuments')}</Link>
                  </li>
                  <li>
                    <Link to="/articles">{t('linkArticles')}</Link>
                  </li>
                  <li>
                    <Link to="/wikis">{t('linkWikis')}</Link>
                  </li>
                </ul>
              </section>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="page-header home-header">
            <div>
              <h1>{t('title')}</h1>
              <p className="page-subtitle">
                {t('subtitleHomeWithoutKnowledgeMap')}
              </p>
            </div>
          </div>

          {hubLoading && <p className="home-muted">{t('loading')}</p>}
          {hubError && (
            <p className="home-error" role="alert">
              {hubError}
            </p>
          )}

          <div className="home-hub-split">
            <div className="home-hub-split__right home-hub-split__right--solo">
              {showDocsWork && (
                <section className="home-hub-card">
                  <h2 className="home-hub-card-title">
                    <Inbox size={20} aria-hidden />
                    {t('workItems')}
                  </h2>
                  <p className="home-muted home-hub-card-intro">
                    {t('workItemsIntro')}
                  </p>
                  {!hub?.work_items?.length ? (
                    <p className="home-muted">{t('workItemsEmpty')}</p>
                  ) : (
                    <ul className="home-work-list">
                      {hub.work_items.map((w) => (
                        <li key={w.id} className="home-work-item">
                          <span className="home-work-type">{w.relation_type}</span>
                          <Link to={`/documents/view/${w.source_document_id}`} className="home-work-link">
                            {w.source_title}
                          </Link>
                          <span className="home-work-arrow" aria-hidden>
                            →
                          </span>
                          <Link to={`/documents/view/${w.target_document_id}`} className="home-work-link">
                            {w.target_title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              <div className="home-hub-split__right-row">
                <section className="home-hub-card home-hub-card--compact">
                  <h2 className="home-hub-card-title">
                    <Share2 size={20} aria-hidden />
                    {t('shareRequests')}
                  </h2>
                  <p className="home-muted">{t('shareRequestsEmpty')}</p>
                </section>

                <section className="home-hub-card home-hub-card--compact">
                  <h2 className="home-hub-card-title">
                    <FileStack size={20} aria-hidden />
                    {t('browseContent')}
                  </h2>
                  <ul className="home-quick-links">
                    <li>
                      <Link to="/documents">{t('linkDocuments')}</Link>
                    </li>
                    <li>
                      <Link to="/articles">{t('linkArticles')}</Link>
                    </li>
                    <li>
                      <Link to="/wikis">{t('linkWikis')}</Link>
                    </li>
                  </ul>
                </section>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
