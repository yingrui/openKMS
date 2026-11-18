import { Navigate, Outlet, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import { KnowledgeBaseDialogs } from './detail/KnowledgeBaseDialogs';
import { TAB_ORDER, TAB_PATHS, type TabId } from './KnowledgeBaseDetail.types';
import { useKnowledgeBaseDetail } from './useKnowledgeBaseDetail';
import { KnowledgeBaseDetailCtx } from './KnowledgeBaseDetailCtx';
import { EntityViewLoading, EntityViewPanel, EntityViewShell } from '../shared/EntityViewShell';
import { ContentCommentsShell } from '../../components/comments/ContentCommentsShell';
import './KnowledgeBaseDetail.scss';
import './detail/dialogs.scss';

/**
 * A knowledge base — the same shell the dataset and semantic-model pages use: identity, counts and the
 * rail in the sidebar, one section per route, and the base's dialogs mounted once beside them.
 *
 * Every section hangs off `/knowledge-bases/:id`, so a link to `…/faqs` means the FAQs tab and the
 * browser's back button walks the reader through what they actually visited.
 */
export function KnowledgeBaseDetail() {
  const d = useKnowledgeBaseDetail();
  const { t, kb, loading } = d;
  const { id: kbId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { pathname } = useLocation();

  /* The route table accepts any `<section>` slug, so a typo must not render the documents list at a URL
     that claims otherwise: send it back to the base. */
  const segments = pathname.split('/').filter(Boolean);
  const sectionSegment = segments.length > 2 ? segments[segments.length - 1] : '';
  const knownSection = Object.values(TAB_PATHS).includes(sectionSegment);
  if (sectionSegment && !knownSection && kbId) {
    return <Navigate to={`/knowledge-bases/${kbId}`} replace />;
  }

  /* `?tab=faqs` was how a section was linked before it had its own URL. Keep the old links working. */
  const legacyTab = searchParams.get('tab');
  const legacySegment = legacyTab ? TAB_PATHS[legacyTab as TabId] : undefined;
  if (legacyTab && legacySegment !== undefined && kbId) {
    return (
      <Navigate
        to={`/knowledge-bases/${kbId}${legacySegment ? `/${legacySegment}` : ''}`}
        replace
      />
    );
  }

  if (loading) return <EntityViewLoading label={t('detail.loading')} />;
  if (!kb) return <p className="page-subtitle">{t('detail.notFound')}</p>;

  const base = `/knowledge-bases/${kb.id}`;
  const stats = [
    t('detail.statDocs', { count: kb.document_count }),
    t('detail.statWikiSpaces', { count: kb.wiki_space_count ?? 0 }),
    t('detail.statFaqs', { count: kb.faq_count }),
    t('detail.statChunks', { count: kb.chunk_count }),
  ].join(' · ');

  return (
    <KnowledgeBaseDetailCtx.Provider value={d}>
      {/* Inside the shell, not around it: `.entity-view` must be the pane's direct child or the pane
          never fills the window and `.app-content` keeps its gutter on top of the pane's (two gutters). */}
      <EntityViewShell
        backTo="/knowledge-bases"
        backLabel={t('detail.backToList')}
        title={kb.name}
        meta={stats}
        identityAction={
          kb.embedding_model_id ? (
            <button
              type="button"
              onClick={() => void d.enqueueIndexJob()}
              disabled={d.indexJobSubmitting}
              title={t('detail.indexJobHeaderTitle')}
              aria-label={t('detail.indexJobHeader')}
            >
              {d.indexJobSubmitting ? (
                <Loader2 size={14} className="kb-spinner-inline" aria-hidden />
              ) : (
                <RefreshCw size={14} aria-hidden />
              )}
              <span>{t('detail.indexJobHeader')}</span>
            </button>
          ) : null
        }
        navItems={TAB_ORDER.map((tab) => ({
          to: TAB_PATHS[tab] ? `${base}/${TAB_PATHS[tab]}` : base,
          label: t(`detail.tabs.${tab}`),
          end: tab === 'documents',
        }))}
      >
        {/* The card the tab used to be drawn inside, now that the shell owns the page chrome. The
            comments rail is fixed to the window edge, so it costs nothing to host it here. */}
        <ContentCommentsShell resourceType="knowledge_base" resourceId={kb.id}>
          <EntityViewPanel>
            <Outlet />
          </EntityViewPanel>
        </ContentCommentsShell>
      </EntityViewShell>
      <KnowledgeBaseDialogs />
    </KnowledgeBaseDetailCtx.Provider>
  );
}

