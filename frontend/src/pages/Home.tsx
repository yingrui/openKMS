import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileStack, FolderTree, Inbox, Share2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useFeatureToggles } from '../contexts/FeatureTogglesContext';
import { HomeStaticLanding } from '../components/HomeStaticLanding';
import { HomeTaxonomyPreview } from '../components/HomeTaxonomyPreview';
import { fetchHomeHub, type HomeHubResponse } from '../data/homeHubApi';
import { fetchTaxonomyTree, type TaxonomyNode } from '../data/taxonomyApi';
import './Home.css';

export function Home() {
  const { isAuthenticated, login, hasPermission } = useAuth();
  const { toggles } = useFeatureToggles();
  const [hub, setHub] = useState<HomeHubResponse | null>(null);
  const [hubError, setHubError] = useState<string | null>(null);
  const [hubLoading, setHubLoading] = useState(false);
  const [taxonomyTree, setTaxonomyTree] = useState<TaxonomyNode[] | null>(null);
  const [taxonomyTreeLoading, setTaxonomyTreeLoading] = useState(false);
  const [taxonomyTreeError, setTaxonomyTreeError] = useState<string | null>(null);
  const loadHub = useCallback(async () => {
    setHubLoading(true);
    setHubError(null);
    try {
      const data = await fetchHomeHub();
      setHub(data);
    } catch (e) {
      setHub(null);
      setHubError(e instanceof Error ? e.message : 'Could not load home data');
    } finally {
      setHubLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void loadHub();
    else {
      setHub(null);
      setHubError(null);
    }
  }, [isAuthenticated, loadHub]);

  const showTaxonomy =
    toggles.taxonomy !== false && (hasPermission('taxonomy:read') || hasPermission('all'));

  useEffect(() => {
    if (!isAuthenticated || !showTaxonomy) {
      setTaxonomyTree(null);
      setTaxonomyTreeError(null);
      setTaxonomyTreeLoading(false);
      return;
    }
    let cancelled = false;
    setTaxonomyTreeLoading(true);
    setTaxonomyTreeError(null);
    void (async () => {
      try {
        const t = await fetchTaxonomyTree();
        if (!cancelled) setTaxonomyTree(t);
      } catch (e) {
        if (!cancelled) {
          setTaxonomyTree(null);
          setTaxonomyTreeError(e instanceof Error ? e.message : 'Could not load Knowledge Map');
        }
      } finally {
        if (!cancelled) setTaxonomyTreeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, showTaxonomy]);

  if (!isAuthenticated) {
    /* Unauthenticated users always see the static marketing home (`/` is not gated). */
    return <HomeStaticLanding onSignIn={login} />;
  }

  const showTaxonomyWrite = hasPermission('taxonomy:write') || hasPermission('all');
  const showDocsWork = hasPermission('documents:read') || hasPermission('all');
  return (
    <div className="home home--hub">
      <div className="page-header home-header">
        <div>
          <h1>Home</h1>
          <p className="page-subtitle">
            Knowledge operations: the Knowledge Map, links, and document lifecycle signals.
          </p>
        </div>
      </div>

      {hubLoading && <p className="home-muted">Loading…</p>}
      {hubError && (
        <p className="home-error" role="alert">
          {hubError}
        </p>
      )}

      <div className={`home-hub-split${showTaxonomy ? ' home-hub-split--with-taxonomy' : ''}`}>
        {showTaxonomy && (
          <aside className="home-hub-split__left" aria-label="Knowledge Map overview">
            <section className="home-hub-card home-hub-card--taxonomy">
              <h2 className="home-hub-card-title">
                <FolderTree size={20} aria-hidden />
                Knowledge Map
              </h2>
              <p className="home-muted home-hub-card-intro home-taxonomy-intro">
                A sitemap-style view of how content is organized. Terms with a number link to channels or wiki spaces.
              </p>
              <HomeTaxonomyPreview
                tree={taxonomyTree}
                treeLoading={taxonomyTreeLoading}
                summaryLoading={hubLoading}
                error={taxonomyTreeError}
                nodeCount={hub?.taxonomy?.node_count ?? null}
                linkCount={hub?.taxonomy?.link_count ?? null}
              />
              <div className="home-hub-card-actions">
                <Link to="/knowledge-map" className="btn btn-secondary">
                  Open Knowledge Map
                </Link>
                {showTaxonomyWrite && (
                  <span className="home-muted home-hub-hint">You can edit terms and refer-tos on that page.</span>
                )}
              </div>
            </section>
          </aside>
        )}

        <div className="home-hub-split__right">
          {showDocsWork && (
            <section className="home-hub-card">
              <h2 className="home-hub-card-title">
                <Inbox size={20} aria-hidden />
                Work items
              </h2>
              <p className="home-muted home-hub-card-intro">
                Recent document relationships (supersedes, amends, implements, see also). Open a document to resolve or
                update lifecycle.
              </p>
              {!hub?.work_items?.length ? (
                <p className="home-muted">No items in the recent queue.</p>
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
                Share requests
              </h2>
              <p className="home-muted">Nothing here yet. Future versions will surface access and collaboration requests.</p>
            </section>

            <section className="home-hub-card home-hub-card--compact">
              <h2 className="home-hub-card-title">
                <FileStack size={20} aria-hidden />
                Browse content
              </h2>
              <ul className="home-quick-links">
                <li>
                  <Link to="/documents">Documents</Link>
                </li>
                <li>
                  <Link to="/articles">Articles</Link>
                </li>
                <li>
                  <Link to="/wikis">Wiki spaces</Link>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
