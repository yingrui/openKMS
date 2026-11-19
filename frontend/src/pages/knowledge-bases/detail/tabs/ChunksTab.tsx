import { Link } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { Layers, Pencil } from 'lucide-react';
import type { ChunkResponse } from '../../../../data/knowledgeBasesApi';
import { EmptyState, Pagination } from '../../../../styles/design-system';
import { EntityViewHeader, EntityViewPanel } from '../../../shared/EntityViewShell';

/**
 * The indexed chunks: what the retriever will actually see.
 *
 * A chunk comes from a document **or** a wiki page, which is why the source cell has three shapes — the
 * link that makes sense for where it came from. Editing is the only action: a chunk's content is what the
 * embedding was computed from, so changing it invalidates the vector until the next index run.
 */
export function ChunksTab({
  t,
  chunks,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onEdit,
}: {
  t: TFunction;
  chunks: ChunkResponse[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onEdit: (chunk: ChunkResponse) => void;
}) {
  return (
    <>
      <EntityViewHeader
        title={t('detail.tabs.chunks')}
        subtitle={t('detail.chunksSubtitle')}
      />
      <EntityViewPanel>
        {total === 0 ? (
          <EmptyState
            icon={<Layers size={40} strokeWidth={1} aria-hidden />}
            description={t('detail.emptyChunks')}
          />
        ) : (
          <>
            <div className="ds-table-wrap ds-table-wrap--flush">
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>{t('detail.chunkSource')}</th>
                    <th>{t('detail.colExcerpt')}</th>
                    <th>{t('detail.colTokens')}</th>
                    <th>{t('detail.colEmbedded')}</th>
                    <th className="ds-table-actions">{t('detail.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {chunks.map((chunk) => (
                    <tr key={chunk.id}>
                      <td>
                        <div className="kb-table-name">
                          <Layers size={18} />
                          {chunk.document_id ? (
                            <Link to={`/documents/view/${chunk.document_id}`}>
                              {chunk.document_name || chunk.document_id}
                            </Link>
                          ) : chunk.wiki_page_id && chunk.wiki_space_id ? (
                            <Link to={`/wikis/${chunk.wiki_space_id}/pages/${chunk.wiki_page_id}`}>
                              {chunk.document_name || chunk.wiki_page_id}
                            </Link>
                          ) : (
                            <span>
                              {chunk.document_name ||
                                chunk.document_id ||
                                chunk.wiki_page_id ||
                                t('detail.dash')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="kb-table-excerpt">{chunk.content.slice(0, 150)}...</td>
                      <td>{chunk.token_count ?? t('detail.dash')}</td>
                      <td>{chunk.has_embedding ? t('detail.yes') : t('detail.no')}</td>
                      <td className="ds-table-actions">
                        <div className="ds-table-btns">
                          <button
                            type="button"
                            title={t('detail.edit')}
                            aria-label={t('detail.edit')}
                            onClick={() => onEdit(chunk)}
                          >
                            <Pencil size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              total={total}
              page={page}
              pageSize={pageSize}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
            />
          </>
        )}
    </EntityViewPanel>
    </>
  );
}
