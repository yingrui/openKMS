import type { TFunction } from 'i18next';

/**
 * The knowledge base's own page control.
 *
 * Three tabs (documents, FAQs, chunks) had written this markup out in full — the same range line, the same
 * four buttons, the same page-size select — so the sizes drifted one tab at a time. It is not the design
 * system's `Pagination`: that one is the app's shape, this one is the knowledge base's, and swapping them
 * would be a restyle rather than a dedupe.
 */
export function KbPagination({
  t,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  t: TFunction;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const totalPages = Math.ceil(total / pageSize) || 1;
  const lastPage = totalPages - 1;

  return (
    <div className="kb-pagination">
      <div className="kb-pagination-info">
        <span>
          {t('detail.paginationRange', {
            start: total === 0 ? 0 : page * pageSize + 1,
            end: Math.min((page + 1) * pageSize, total),
            total,
          })}
        </span>
        <label>
          <span>{t('detail.pageSize')}</span>
          <select
            value={pageSize}
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
      {totalPages > 1 && (
        <div className="kb-pagination-btns">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onPageChange(0)}
            disabled={page === 0}
            title={t('detail.firstPage')}
          >
            «
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onPageChange(Math.max(0, page - 1))}
            disabled={page === 0}
          >
            {t('detail.previous')}
          </button>
          <span className="kb-pagination-nums">
            {t('detail.pageOf', { current: page + 1, total: totalPages })}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onPageChange(Math.min(lastPage, page + 1))}
            disabled={page >= lastPage}
          >
            {t('detail.next')}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onPageChange(lastPage)}
            disabled={page >= lastPage}
            title={t('detail.lastPage')}
          >
            »
          </button>
        </div>
      )}
    </div>
  );
}
