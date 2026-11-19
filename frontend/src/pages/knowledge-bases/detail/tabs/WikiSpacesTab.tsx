import { Link } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { BookOpen, Eye, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { KBWikiSpaceResponse } from '../../../../data/knowledgeBasesApi';
import { EntityViewHeader, EntityViewPanel } from '../../../shared/EntityViewShell';

/**
 * The wiki spaces linked into this knowledge base.
 *
 * Linking is the page's dialog; this tab is the list, its per-space re-index, and what is linked.
 * Re-indexing is disabled without an embedding model — the run would have nothing to embed with.
 */
export function WikiSpacesTab({
  t,
  spaces,
  hasEmbeddingModel,
  busyId,
  onAdd,
  onIndex,
  onRemove,
}: {
  t: TFunction;
  spaces: KBWikiSpaceResponse[];
  hasEmbeddingModel: boolean;
  busyId: string | null;
  onAdd: () => void;
  onIndex: (wikiSpaceId: string) => void;
  onRemove: (wikiSpaceId: string) => void;
}) {
  return (
    <>
      <EntityViewHeader
        title={t('detail.wikiSpacesTitle')}
        subtitle={t('detail.wikiIndexHint')}
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={onAdd}
            aria-label={t('detail.addWikiSpace')}
          >
            <Plus size={16} aria-hidden />
            <span className="ds-compact-label">{t('detail.addWikiSpace')}</span>
          </button>
        }
      />
      <EntityViewPanel>
      <p className="kb-section-desc kb-wiki-index-hint">{t('detail.wikiIndexHint')}</p>
      {spaces.length === 0 ? (
        <p className="kb-empty-text">{t('detail.emptyWikiSpaces')}</p>
      ) : (
        <div className="ds-table-wrap ds-table-wrap--flush">
          <table className="kb-table">
            <thead>
              <tr>
                <th>{t('detail.colWikiSpace')}</th>
                <th className="kb-table-actions">{t('detail.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {spaces.map((ws) => (
                <tr key={ws.id}>
                  <td>
                    <div className="kb-table-name">
                      <BookOpen size={18} />
                      <Link to={`/wikis/${ws.wiki_space_id}/pages/graph`}>
                        {ws.wiki_space_name || ws.wiki_space_id}
                      </Link>
                    </div>
                  </td>
                  <td className="kb-table-actions">
                    <div className="kb-table-btns">
                      <button
                        type="button"
                        title={t('detail.indexWikiSpace')}
                        aria-label={t('detail.indexWikiSpace')}
                        disabled={busyId === ws.wiki_space_id || !hasEmbeddingModel}
                        onClick={() => onIndex(ws.wiki_space_id)}
                      >
                        {busyId === ws.wiki_space_id ? (
                          <Loader2 size={16} className="kb-spinner-inline" aria-hidden />
                        ) : (
                          <RefreshCw size={16} aria-hidden />
                        )}
                      </button>
                      <Link
                        to={`/wikis/${ws.wiki_space_id}/pages/graph`}
                        title={t('detail.view')}
                        aria-label={t('detail.view')}
                      >
                        <Eye size={16} />
                      </Link>
                      <button
                        type="button"
                        title={t('detail.remove')}
                        aria-label={t('detail.remove')}
                        disabled={busyId === ws.wiki_space_id}
                        onClick={() => onRemove(ws.wiki_space_id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </EntityViewPanel>
    </>
  );
}
