import { Link } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { Eye, FileStack, Plus, Trash2 } from 'lucide-react';
import type { KBDocumentResponse } from '../../../../data/knowledgeBasesApi';
import { EntityViewHeader, EntityViewPanel } from '../../../shared/EntityViewShell';
import { KbPagination } from '../KbPagination';

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
  return (
    <>
      <EntityViewHeader
        title={t('detail.documentsTitle', { count: docTotal })}
        subtitle={t('detail.documentsSubtitle')}
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={onAdd}
            aria-label={t('detail.addDocument')}
          >
            <Plus size={16} aria-hidden />
            <span className="ds-compact-label">{t('detail.addDocument')}</span>
          </button>
        }
      />
      <EntityViewPanel>
      {docTotal === 0 ? (
        <p className="kb-empty-text">{t('detail.emptyDocuments')}</p>
      ) : (
        <>
          <div className="ds-table-wrap ds-table-wrap--flush">
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
          <KbPagination
            t={t}
            total={docTotal}
            page={docPage}
            pageSize={docPageSize}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </>
      )}
    </EntityViewPanel>
    </>
  );
}
