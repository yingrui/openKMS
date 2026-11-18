import type { TFunction } from 'i18next';
import { HelpCircle, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { FAQResponse } from '../../../../data/knowledgeBasesApi';
import { PanelToolbar } from '../../../../styles/design-system';
import { KbPagination } from '../KbPagination';

/**
 * The FAQ pairs curated for this knowledge base: written by hand, generated from documents, or saved out of
 * a conversation.
 *
 * The dialogs (edit, and the two-step generate flow) belong to the page — they write the base's FAQ rows and
 * need its metadata keys; this tab is the list of what is there.
 */
export function FaqsTab({
  t,
  faqs,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onGenerate,
  onAdd,
  onEdit,
  onDelete,
}: {
  t: TFunction;
  faqs: FAQResponse[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onGenerate: () => void;
  onAdd: () => void;
  onEdit: (faq: FAQResponse) => void;
  onDelete: (faqId: string) => void;
}) {
  return (
    <section className="kb-section">
      <PanelToolbar
        className="kb-section-header"
        leading={<span>{t('detail.faqsTitle', { count: total })}</span>}
        actions={
          <div className="kb-section-header-btns">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onGenerate}
              aria-label={t('detail.generateFaq')}
            >
              <Sparkles size={16} aria-hidden />
              <span className="ds-compact-label">{t('detail.generateFaq')}</span>
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              aria-label={t('detail.addFaq')}
              onClick={onAdd}
            >
              <Plus size={16} aria-hidden />
              <span className="ds-compact-label">{t('detail.addFaq')}</span>
            </button>
          </div>
        }
      />

      {total === 0 ? (
        <p className="kb-empty-text">{t('detail.emptyFaqs')}</p>
      ) : (
        <>
          <div className="ds-table-wrap">
            <table className="kb-table">
              <thead>
                <tr>
                  <th className="kb-table-question-col">{t('detail.colQuestion')}</th>
                  <th>{t('detail.colAnswer')}</th>
                  <th className="kb-table-source-col">{t('detail.colSource')}</th>
                  <th className="kb-table-actions">{t('detail.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {faqs.map((faq) => (
                  <tr key={faq.id}>
                    <td className="kb-table-question-col">
                      <div className="kb-table-name">
                        <HelpCircle size={18} />
                        <span>{faq.question}</span>
                      </div>
                    </td>
                    <td className="kb-table-excerpt">{faq.answer}</td>
                    <td className="kb-table-source-col">
                      <span
                        className="kb-table-source"
                        title={faq.document_name || faq.document_id || undefined}
                      >
                        {faq.document_name || faq.document_id || t('detail.dash')}
                      </span>
                    </td>
                    <td className="kb-table-actions">
                      <div className="kb-table-btns">
                        <button
                          type="button"
                          title={t('detail.edit')}
                          aria-label={t('detail.edit')}
                          onClick={() => onEdit(faq)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          title={t('detail.remove')}
                          aria-label={t('detail.remove')}
                          onClick={() => onDelete(faq.id)}
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
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </>
      )}
    </section>
  );
}
