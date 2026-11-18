import { Link } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { Eye, FileStack, Plus, Trash2 } from 'lucide-react';
import type { KBDocumentResponse } from '../../../../data/knowledgeBasesApi';
import { PanelToolbar } from '../../../../styles/design-system';

/**
 * The documents linked into this knowledge base.
 *
 * A tab of its own because the list is a thing a reader opens, pages through and edits on its own terms —
 * and because the page around it was doing seven of these at once. The picker dialog stays with the page:
 * adding a document is a flow with its own channel tree and search, not part of this table.
 */
export function DocumentsTab({
  t,
  docs,
  docTotal,
  docPage,
  docPageSize,
  onPageChange,
  onPageSizeChange,
  onAdd,
  onRemove,
}: {
  t: TFunction;
  docs: KBDocumentResponse[];
  docTotal: number;
  docPage: number;
  docPageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onAdd: () => void;
  onRemove: (documentId: string) => void;
}) {
  const lastPage = Math.ceil(docTotal / docPageSize) - 1;

  return (
    <section className="kb-section">
      <PanelToolbar
        className="kb-section-header"
        leading={<span>{t('detail.documentsTitle', { count: docTotal })}</span>}
        actions={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onAdd}
            aria-label={t('detail.addDocument')}
          >
            <Plus size={16} aria-hidden />
            <span className="ds-compact-label">{t('detail.addDocument')}</span>
          </button>
        }
      />
      {docTotal === 0 ? (
        <p className="kb-empty-text">{t('detail.emptyDocuments')}</p>
      ) : (
        <>
          <div className="ds-table-wrap">
            <table className="kb-table">
              <thead>
                <tr>
                  <th>{t('detail.colName')}</th>
                  <th>{t('detail.colType')}</th>
                  <th>{t('detail.colStatus')}</th>
                  <th className="kb-table-actions">{t('detail.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <div className="kb-table-name">
                        <FileStack size={18} />
                        <Link to={`/documents/view/${doc.document_id}`}>
                          {doc.document_name || doc.document_id}
                        </Link>
                      </div>
                    </td>
                    <td>{doc.document_file_type}</td>
                    <td>{doc.document_status}</td>
                    <td className="kb-table-actions">
                      <div className="kb-table-btns">
                        <Link
                          to={`/documents/view/${doc.document_id}`}
                          title={t('detail.view')}
                          aria-label={t('detail.view')}
                        >
                          <Eye size={16} />
                        </Link>
                        <button
                          type="button"
                          title={t('detail.remove')}
                          aria-label={t('detail.remove')}
                          onClick={() => onRemove(doc.document_id)}
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
          <div className="kb-pagination">
            <div className="kb-pagination-info">
              <span>
                {t('detail.paginationRange', {
                  start: docTotal === 0 ? 0 : docPage * docPageSize + 1,
                  end: Math.min((docPage + 1) * docPageSize, docTotal),
                  total: docTotal,
                })}
              </span>
              <label>
                <span>{t('detail.pageSize')}</span>
                <select
                  value={docPageSize}
                  onChange={(e) => {
                    onPageSizeChange(Number(e.target.value));
                    onPageChange(0);
                  }}
                  className="ds-control"
                >
                  {[25, 50, 100, 200].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {lastPage > 0 && (
              <div className="kb-pagination-btns">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onPageChange(0)}
                  disabled={docPage === 0}
                  title={t('detail.firstPage')}
                >
                  «
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onPageChange(Math.max(0, docPage - 1))}
                  disabled={docPage === 0}
                >
                  {t('detail.previous')}
                </button>
                <span className="kb-pagination-nums">
                  {t('detail.pageOf', { current: docPage + 1, total: lastPage + 1 })}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onPageChange(Math.min(lastPage, docPage + 1))}
                  disabled={docPage >= lastPage}
                >
                  {t('detail.next')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onPageChange(lastPage)}
                  disabled={docPage >= lastPage}
                  title={t('detail.lastPage')}
                >
                  »
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
