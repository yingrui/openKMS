import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDatasetRows, type DatasetRowsResponse } from '../../data/datasetsApi';
import { EntityViewHeader, EntityViewPanel } from './EntityViewShell';

export function DatasetDataTab() {
  const { t } = useTranslation('ontology');
  const { id: datasetId = '' } = useParams();
  const [rowsData, setRowsData] = useState<DatasetRowsResponse | null>(null);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);

  const displayCellValue = useCallback(
    (v: unknown): string => {
      if (v === null || v === undefined) return t('datasets.dash');
      if (typeof v === 'boolean') return v ? t('datasets.yes') : t('datasets.no');
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    },
    [t],
  );

  const loadRows = useCallback(async () => {
    if (!datasetId) return;
    setRowsLoading(true);
    try {
      setRowsData(
        await fetchDatasetRows(datasetId, {
          limit: pageSize,
          offset: page * pageSize,
        }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadRowsFailed'));
    } finally {
      setRowsLoading(false);
    }
  }, [datasetId, page, pageSize, t]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const columns = rowsData?.rows?.[0] ? Object.keys(rowsData.rows[0]) : [];
  const total = rowsData?.total ?? 0;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;
  const startRow = total > 0 ? page * pageSize + 1 : 0;
  const endRow = total > 0 ? Math.min((page + 1) * pageSize, total) : 0;

  return (
    <>
      <EntityViewHeader title={t('datasets.data')} subtitle={t('datasets.dataHint')} />
      <EntityViewPanel>
        {rowsLoading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" aria-hidden />
            <p>{t('shared.loading')}</p>
          </div>
        ) : (
          <div className="dataset-detail-data">
            <div className="ds-table-wrap ds-table-wrap--flush">
              <table className="console-table">
                <thead>
                  <tr>
                    {columns.map((col) => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {!rowsData?.rows?.length ? (
                    <tr>
                      <td colSpan={columns.length || 1} className="console-table-empty">
                        {t('datasets.emptyRows')}
                      </td>
                    </tr>
                  ) : (
                    rowsData.rows.map((row, idx) => (
                      <tr key={idx}>
                        {columns.map((col) => (
                          <td key={col}>{displayCellValue(row[col])}</td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {rowsData && (
              <div className="dataset-detail-pagination">
                <div className="dataset-detail-pagination__info">
                  <span>
                    {t('datasets.paginationRange', { start: startRow, end: endRow, total })}
                  </span>
                  <label>
                    <span>{t('datasets.pageSize')}</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(0);
                      }}
                      disabled={rowsLoading}
                    >
                      {[25, 50, 100, 200, 500].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {totalPages > 1 && (
                  <div className="dataset-detail-pagination__btns">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setPage(0)}
                      disabled={page === 0 || rowsLoading}
                      title={t('datasets.firstPage')}
                    >
                      «
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0 || rowsLoading}
                    >
                      {t('datasets.previous')}
                    </button>
                    <span className="dataset-detail-pagination__page">
                      {t('datasets.pageOf', { current: page + 1, total: totalPages })}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1 || rowsLoading}
                    >
                      {t('datasets.next')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setPage(totalPages - 1)}
                      disabled={page >= totalPages - 1 || rowsLoading}
                      title={t('datasets.lastPage')}
                    >
                      »
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </EntityViewPanel>
    </>
  );
}
