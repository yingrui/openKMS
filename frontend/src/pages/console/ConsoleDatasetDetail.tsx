import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Table, FileJson, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchDataset,
  fetchDatasetRows,
  fetchDatasetMetadata,
  type DatasetResponse,
  type ColumnMetadata,
  type DatasetRowsResponse,
} from '../../data/datasetsApi';
import './ConsoleDatasetDetail.css';

type TabId = 'data' | 'metadata';

function displayValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function ConsoleDatasetDetail() {
  const { id } = useParams<{ id: string }>();
  const [dataset, setDataset] = useState<DatasetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('data');

  const [rowsData, setRowsData] = useState<DatasetRowsResponse | null>(null);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [metadata, setMetadata] = useState<ColumnMetadata[]>([]);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);

  const loadDataset = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const d = await fetchDataset(id);
      setDataset(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load dataset');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDataset();
  }, [loadDataset]);

  const loadRows = useCallback(async () => {
    if (!id) return;
    setRowsLoading(true);
    try {
      const res = await fetchDatasetRows(id, {
        limit: pageSize,
        offset: page * pageSize,
      });
      setRowsData(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load rows');
    } finally {
      setRowsLoading(false);
    }
  }, [id, page, pageSize]);

  const loadMetadata = useCallback(async () => {
    if (!id) return;
    setMetadataLoading(true);
    try {
      const cols = await fetchDatasetMetadata(id);
      setMetadata(cols);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load metadata');
    } finally {
      setMetadataLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (activeTab === 'data') loadRows();
  }, [activeTab, loadRows]);

  useEffect(() => {
    if (activeTab === 'metadata') loadMetadata();
  }, [activeTab, loadMetadata]);

  if (loading || !dataset) {
    return (
      <div className="console-dataset-detail">
        <div className="console-dataset-detail-loading">
          <Loader2 size={32} className="console-loading-spinner" />
          <p>Loading dataset…</p>
        </div>
      </div>
    );
  }

  const displayName = dataset.display_name || `${dataset.schema_name}.${dataset.table_name}`;
  const columns = rowsData?.rows?.[0] ? Object.keys(rowsData.rows[0]) : [];
  const total = rowsData?.total ?? 0;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;
  const startRow = total > 0 ? page * pageSize + 1 : 0;
  const endRow = total > 0 ? Math.min((page + 1) * pageSize, total) : 0;

  return (
    <div className="console-dataset-detail">
      <div className="console-dataset-detail-header">
        <Link to="/ontology/datasets" className="console-dataset-detail-back">
          <ArrowLeft size={18} />
          <span>Back to Datasets</span>
        </Link>
        <div>
          <h1>{displayName}</h1>
          <p className="console-dataset-detail-subtitle">
            {dataset.schema_name}.{dataset.table_name}
            {dataset.data_source_name && ` • ${dataset.data_source_name}`}
          </p>
        </div>
      </div>

      <div className="console-dataset-detail-tabs">
        <button
          type="button"
          className={`console-dataset-detail-tab ${activeTab === 'data' ? 'active' : ''}`}
          onClick={() => setActiveTab('data')}
        >
          <Table size={18} />
          <span>Data</span>
        </button>
        <button
          type="button"
          className={`console-dataset-detail-tab ${activeTab === 'metadata' ? 'active' : ''}`}
          onClick={() => setActiveTab('metadata')}
        >
          <FileJson size={18} />
          <span>Metadata</span>
        </button>
      </div>

      <div className="console-dataset-detail-content">
        {activeTab === 'data' && (
          <div className="console-dataset-detail-data">
            {rowsLoading ? (
              <div className="console-loading">
                <Loader2 size={32} className="console-loading-spinner" />
                <p>Loading rows…</p>
              </div>
            ) : (
              <>
                <div className="console-dataset-detail-table-wrap">
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
                            No rows in this table.
                          </td>
                        </tr>
                      ) : (
                        rowsData.rows.map((row, idx) => (
                          <tr key={idx}>
                            {columns.map((col) => (
                              <td key={col}>{displayValue(row[col])}</td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {rowsData && (
                  <div className="console-dataset-detail-pagination">
                    <div className="console-dataset-detail-pagination-info">
                      <span>
                        Showing {startRow}–{endRow} of {total} rows
                      </span>
                      <label>
                        <span>Page size:</span>
                        <select
                          value={pageSize}
                          onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setPage(0);
                          }}
                          disabled={rowsLoading}
                        >
                          {[25, 50, 100, 200, 500].map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {totalPages > 1 && (
                      <div className="console-dataset-detail-pagination-btns">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setPage(0)}
                          disabled={page === 0 || rowsLoading}
                          title="First page"
                        >
                          «
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setPage((p) => Math.max(0, p - 1))}
                          disabled={page === 0 || rowsLoading}
                        >
                          Previous
                        </button>
                        <span className="console-dataset-detail-page-nums">
                          Page {page + 1} of {totalPages}
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                          disabled={page >= totalPages - 1 || rowsLoading}
                        >
                          Next
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setPage(totalPages - 1)}
                          disabled={page >= totalPages - 1 || rowsLoading}
                          title="Last page"
                        >
                          »
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'metadata' && (
          <div className="console-dataset-detail-metadata">
            {metadataLoading ? (
              <div className="console-loading">
                <Loader2 size={32} className="console-loading-spinner" />
                <p>Loading metadata…</p>
              </div>
            ) : (
              <div className="console-dataset-detail-table-wrap">
                <table className="console-table">
                  <thead>
                    <tr>
                      <th>Column</th>
                      <th>Data Type</th>
                      <th>Nullable</th>
                      <th>Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metadata.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="console-table-empty">
                          No metadata available.
                        </td>
                      </tr>
                    ) : (
                      metadata.map((col) => (
                        <tr key={col.column_name}>
                          <td><strong>{col.column_name}</strong></td>
                          <td>{col.data_type}</td>
                          <td>{col.is_nullable ? 'Yes' : 'No'}</td>
                          <td>{col.ordinal_position}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
