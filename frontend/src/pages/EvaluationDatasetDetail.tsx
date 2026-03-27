import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  X,
  Play,
  Loader2,
  Upload,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchEvaluationDataset,
  fetchEvaluationDatasetItems,
  createEvaluationDatasetItem,
  updateEvaluationDatasetItem,
  deleteEvaluationDatasetItem,
  importEvaluationDatasetItems,
  runEvaluation,
  listEvaluationRuns,
  getEvaluationRun,
  compareEvaluationRuns,
  type EvaluationDatasetResponse,
  type EvaluationDatasetItemResponse,
  type EvaluationRunResponse,
  type EvaluationRunListItem,
  type EvaluationCompareResponse,
} from '../data/evaluationDatasetsApi';

const EVAL_TYPE_SEARCH = 'search_retrieval';
const EVAL_TYPE_QA = 'qa_answer';

const DEFAULT_ITEMS_PAGE_SIZE = 10;

import './EvaluationDatasetDetail.css';

export function EvaluationDatasetDetail() {
  const { id: datasetId } = useParams<{ id: string }>();
  const [dataset, setDataset] = useState<EvaluationDatasetResponse | null>(null);
  const [items, setItems] = useState<EvaluationDatasetItemResponse[]>([]);
  const [itemsTotal, setItemsTotal] = useState(0);
  const [itemsPage, setItemsPage] = useState(0);
  const [itemsPageSize, setItemsPageSize] = useState(DEFAULT_ITEMS_PAGE_SIZE);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showItemForm, setShowItemForm] = useState(false);
  const [editItem, setEditItem] = useState<EvaluationDatasetItemResponse | null>(null);
  const [itemQuery, setItemQuery] = useState('');
  const [itemExpected, setItemExpected] = useState('');
  const [itemTopic, setItemTopic] = useState('');
  const [itemSaving, setItemSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [running, setRunning] = useState(false);
  const [evaluationType, setEvaluationType] = useState<string>(EVAL_TYPE_SEARCH);
  const [runView, setRunView] = useState<EvaluationRunResponse | null>(null);
  const [runs, setRuns] = useState<EvaluationRunListItem[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [compareRunA, setCompareRunA] = useState('');
  const [compareRunB, setCompareRunB] = useState('');
  const [compareData, setCompareData] = useState<EvaluationCompareResponse | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const loadDataset = useCallback(async () => {
    if (!datasetId) return;
    try {
      const data = await fetchEvaluationDataset(datasetId);
      setDataset(data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load evaluation dataset');
    } finally {
      setLoading(false);
    }
  }, [datasetId]);

  const fetchItemsForPage = useCallback(
    async (page: number) => {
      if (!datasetId) return;
      setItemsLoading(true);
      try {
        const offset = page * itemsPageSize;
        const res = await fetchEvaluationDatasetItems(datasetId, { offset, limit: itemsPageSize });
        if (res.items.length === 0 && res.total > 0 && page > 0) {
          const lastPage = Math.max(0, Math.ceil(res.total / itemsPageSize) - 1);
          await fetchItemsForPage(lastPage);
          return;
        }
        setItems(res.items);
        setItemsTotal(res.total);
        setItemsPage(page);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Failed to load items');
      } finally {
        setItemsLoading(false);
      }
    },
    [datasetId, itemsPageSize]
  );

  useEffect(() => {
    loadDataset();
  }, [loadDataset]);

  useEffect(() => {
    if (datasetId) fetchItemsForPage(itemsPage);
  }, [datasetId, itemsPage, itemsPageSize, fetchItemsForPage]);

  const loadRuns = useCallback(async () => {
    if (!datasetId) return;
    setRunsLoading(true);
    try {
      const res = await listEvaluationRuns(datasetId, { limit: 100 });
      setRuns(res.items);
    } catch {
      setRuns([]);
    } finally {
      setRunsLoading(false);
    }
  }, [datasetId]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  const handleAddItem = async () => {
    if (!datasetId || !itemQuery.trim() || !itemExpected.trim()) return;
    setItemSaving(true);
    try {
      await createEvaluationDatasetItem(datasetId, {
        query: itemQuery.trim(),
        expected_answer: itemExpected.trim(),
        topic: itemTopic.trim() || undefined,
      });
      setShowItemForm(false);
      setItemQuery('');
      setItemExpected('');
      setItemTopic('');
      toast.success('Item added');
      await fetchItemsForPage(itemsPage);
      loadDataset();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to add item');
    } finally {
      setItemSaving(false);
    }
  };

  const handleUpdateItem = async () => {
    if (!datasetId || !editItem || !itemQuery.trim() || !itemExpected.trim()) return;
    setItemSaving(true);
    try {
      await updateEvaluationDatasetItem(datasetId, editItem.id, {
        query: itemQuery.trim(),
        expected_answer: itemExpected.trim(),
        topic: itemTopic.trim() || undefined,
      });
      setEditItem(null);
      setItemQuery('');
      setItemExpected('');
      setItemTopic('');
      toast.success('Item updated');
      await fetchItemsForPage(itemsPage);
      loadDataset();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update item');
    } finally {
      setItemSaving(false);
    }
  };

  const handleDeleteItem = async (item: EvaluationDatasetItemResponse) => {
    if (!datasetId || !confirm('Delete this item?')) return;
    try {
      await deleteEvaluationDatasetItem(datasetId, item.id);
      toast.success('Item deleted');
      await fetchItemsForPage(itemsPage);
      loadDataset();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete item');
    }
  };

  const openEditItem = (item: EvaluationDatasetItemResponse) => {
    setEditItem(item);
    setItemQuery(item.query);
    setItemExpected(item.expected_answer);
    setItemTopic(item.topic ?? '');
  };

  const closeItemForm = () => {
    setShowItemForm(false);
    setEditItem(null);
    setItemQuery('');
    setItemExpected('');
    setItemTopic('');
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!datasetId || !file) return;
    e.target.value = '';
    setImporting(true);
    try {
      const res = await importEvaluationDatasetItems(datasetId, file);
      toast.success(`Imported ${res.imported} items`);
      loadDataset();
      await fetchItemsForPage(0);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to import CSV');
    } finally {
      setImporting(false);
    }
  };

  const handleRunEvaluation = async () => {
    if (!datasetId) return;
    setRunning(true);
    setRunView(null);
    try {
      const res = await runEvaluation(datasetId, { evaluation_type: evaluationType });
      setRunView(res);
      toast.success(`Run ${res.run_id.slice(0, 8)}… · ${res.pass_count}/${res.item_count} pass`);
      loadRuns();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to run evaluation');
    } finally {
      setRunning(false);
    }
  };

  const handleLoadRun = async (runId: string) => {
    if (!datasetId) return;
    try {
      const res = await getEvaluationRun(datasetId, runId);
      setRunView(res);
      toast.success('Loaded run');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load run');
    }
  };

  const handleCompare = async () => {
    if (!datasetId || !compareRunA || !compareRunB || compareRunA === compareRunB) {
      toast.error('Pick two different runs');
      return;
    }
    setCompareLoading(true);
    setCompareData(null);
    try {
      const res = await compareEvaluationRuns(datasetId, compareRunA, compareRunB);
      setCompareData(res);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to compare');
    } finally {
      setCompareLoading(false);
    }
  };

  if (loading || !dataset) {
    return (
      <div className="eval-detail">
        <p className="eval-detail-loading">Loading...</p>
      </div>
    );
  }

  return (
    <div className="eval-detail">
      <Link to="/evaluation-datasets" className="eval-detail-back">
        <ArrowLeft size={18} />
        <span>Back to Evaluation</span>
      </Link>

      <header className="eval-detail-header">
        <div>
          <h1>{dataset.name}</h1>
          <p className="eval-detail-subtitle">
            {dataset.knowledge_base_name || dataset.knowledge_base_id}
            {dataset.description && ` • ${dataset.description}`}
          </p>
        </div>
        <div className="eval-detail-header-actions">
          <label className="eval-detail-type-label">
            <span>Type</span>
            <select
              value={evaluationType}
              onChange={(e) => setEvaluationType(e.target.value)}
              disabled={running}
              className="eval-detail-type-select"
            >
              <option value={EVAL_TYPE_SEARCH}>Search retrieval</option>
              <option value={EVAL_TYPE_QA}>Question answering (agent)</option>
            </select>
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRunEvaluation}
            disabled={running || itemsTotal === 0}
          >
            {running ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
            <span>{running ? 'Running...' : 'Run evaluation'}</span>
          </button>
        </div>
      </header>

      <section className="eval-detail-section">
        <div className="eval-detail-section-header">
          <h2>Items ({itemsTotal})</h2>
          <div className="eval-detail-section-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleImportFile}
              style={{ display: 'none' }}
              aria-hidden
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleImportClick}
              disabled={importing}
            >
              {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              <span>{importing ? 'Importing...' : 'Import Data'}</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setShowItemForm(true);
                setItemQuery('');
                setItemExpected('');
                setItemTopic('');
              }}
            >
              <Plus size={16} />
              <span>Add Item</span>
            </button>
            <label className="eval-items-page-size">
              <span className="eval-items-page-size-label">Per page</span>
              <select
                value={itemsPageSize}
                onChange={(e) => {
                  setItemsPageSize(Number(e.target.value));
                  setItemsPage(0);
                }}
                aria-label="Items per page"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
        </div>

        {itemsLoading && items.length === 0 ? (
          <p className="eval-detail-loading">Loading items…</p>
        ) : itemsTotal === 0 ? (
          <p className="eval-empty-text">No items yet. Add query + expected answer pairs.</p>
        ) : (
          <>
            <div className={`eval-table-wrap ${itemsLoading ? 'eval-table-wrap--loading' : ''}`}>
              <table className="eval-table">
                <thead>
                  <tr>
                    <th>Topic</th>
                    <th>Query</th>
                    <th>Expected Answer</th>
                    <th className="eval-table-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="eval-table-topic">{item.topic ?? '—'}</td>
                      <td className="eval-table-query">{item.query}</td>
                      <td className="eval-table-expected">{item.expected_answer}</td>
                      <td className="eval-table-actions">
                        <div className="eval-table-btns">
                          <button
                            type="button"
                            title="Edit"
                            aria-label="Edit"
                            onClick={() => openEditItem(item)}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            aria-label="Delete"
                            onClick={() => handleDeleteItem(item)}
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
            {(() => {
              const totalPages = Math.max(1, Math.ceil(itemsTotal / itemsPageSize));
              const from = itemsTotal === 0 ? 0 : itemsPage * itemsPageSize + 1;
              const to = Math.min((itemsPage + 1) * itemsPageSize, itemsTotal);
              return (
                <div className="eval-items-pagination">
                  <span className="eval-items-pagination-range">
                    {itemsTotal === 0 ? '0 items' : `Showing ${from}–${to} of ${itemsTotal}`}
                  </span>
                  <div className="eval-items-pagination-nav">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={itemsPage <= 0 || itemsLoading}
                      onClick={() => setItemsPage((p) => Math.max(0, p - 1))}
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <span className="eval-items-pagination-page">
                      Page {itemsPage + 1} / {totalPages}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={itemsPage >= totalPages - 1 || itemsLoading}
                      onClick={() => setItemsPage((p) => p + 1)}
                      aria-label="Next page"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </section>

      <section className="eval-detail-section">
        <div className="eval-detail-section-header">
          <h2>Run history</h2>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => loadRuns()}
            disabled={runsLoading}
          >
            {runsLoading ? <Loader2 size={16} className="animate-spin" /> : null}
            <span>Refresh</span>
          </button>
        </div>
        {runs.length === 0 ? (
          <p className="eval-empty-text">No saved runs yet. Run an evaluation to create a report.</p>
        ) : (
          <div className="eval-table-wrap">
            <table className="eval-table eval-runs-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Pass</th>
                  <th>Avg score</th>
                  <th>Status</th>
                  <th className="eval-table-actions">View</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="eval-run-date">{new Date(r.created_at).toLocaleString()}</td>
                    <td>
                      <code className="eval-run-type">{r.evaluation_type}</code>
                    </td>
                    <td>
                      {r.pass_count}/{r.item_count}
                    </td>
                    <td>{r.avg_score != null ? r.avg_score.toFixed(2) : '—'}</td>
                    <td>{r.status}</td>
                    <td className="eval-table-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleLoadRun(r.id)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="eval-detail-section">
        <h2>Compare runs</h2>
        <p className="eval-compare-hint">
          Select two runs to compare pass/score per dataset item (same items in both runs).
        </p>
        <div className="eval-compare-controls">
          <label>
            <span>Run A</span>
            <select
              value={compareRunA}
              onChange={(e) => setCompareRunA(e.target.value)}
              className="eval-compare-select"
            >
              <option value="">—</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {new Date(r.created_at).toLocaleString()} · {r.evaluation_type}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Run B</span>
            <select
              value={compareRunB}
              onChange={(e) => setCompareRunB(e.target.value)}
              className="eval-compare-select"
            >
              <option value="">—</option>
              {runs.map((r) => (
                <option key={`b-${r.id}`} value={r.id}>
                  {new Date(r.created_at).toLocaleString()} · {r.evaluation_type}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleCompare}
            disabled={compareLoading || !compareRunA || !compareRunB}
          >
            {compareLoading ? <Loader2 size={16} className="animate-spin" /> : null}
            <span>Compare</span>
          </button>
        </div>
        {compareData && compareData.rows.length > 0 && (
          <div className="eval-table-wrap eval-compare-table-wrap">
            <table className="eval-table">
              <thead>
                <tr>
                  <th>Query</th>
                  <th>Pass A</th>
                  <th>Score A</th>
                  <th>Pass B</th>
                  <th>Score B</th>
                  <th>Δ score</th>
                  <th>Pass changed</th>
                </tr>
              </thead>
              <tbody>
                {compareData.rows.map((row) => (
                  <tr key={row.evaluation_dataset_item_id}>
                    <td className="eval-table-query">{row.query.slice(0, 120)}{row.query.length > 120 ? '…' : ''}</td>
                    <td>{row.pass_a ? 'Yes' : 'No'}</td>
                    <td>{row.score_a.toFixed(2)}</td>
                    <td>{row.pass_b ? 'Yes' : 'No'}</td>
                    <td>{row.score_b.toFixed(2)}</td>
                    <td>{row.score_delta >= 0 ? '+' : ''}{row.score_delta.toFixed(2)}</td>
                    <td>{row.pass_changed ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {runView && runView.results.length > 0 && (
        <section className="eval-detail-section eval-results-section">
          <h2>Run detail</h2>
          <div className="eval-results-meta">
            <span>
              <strong>Run</strong> <code>{runView.run_id}</code>
            </span>
            <span>
              <strong>Type</strong> <code>{runView.evaluation_type}</code>
            </span>
            <span>
              <strong>Status</strong> {runView.status}
            </span>
          </div>
          <div className="eval-results-summary">
            Pass: {runView.pass_count} / {runView.item_count} · Avg score:{' '}
            {runView.avg_score != null ? runView.avg_score.toFixed(2) : '—'}
          </div>
          <div className="eval-results-list">
            {runView.results.map((r) => (
              <div key={r.item_id} className="eval-result-item">
                <div className="eval-result-header">
                  <span className={`eval-result-badge ${r.pass ? 'eval-result-pass' : 'eval-result-fail'}`}>
                    {r.pass ? 'Pass' : 'Fail'}
                  </span>
                  <span className="eval-result-score">Score: {r.score.toFixed(2)}</span>
                </div>
                <div className="eval-result-query">
                  <strong>Query:</strong> {r.query}
                </div>
                <div className="eval-result-expected">
                  <strong>Expected:</strong>
                  <p>{r.expected_answer}</p>
                </div>
                {runView.evaluation_type === EVAL_TYPE_QA && r.generated_answer != null && r.generated_answer !== '' && (
                  <div className="eval-result-generated">
                    <strong>Generated answer:</strong>
                    <p>{r.generated_answer}</p>
                  </div>
                )}
                {runView.evaluation_type === EVAL_TYPE_QA && (r.qa_sources?.length ?? 0) > 0 && (
                  <div className="eval-result-snippets">
                    <strong>Sources:</strong>
                    <ul>
                      {(r.qa_sources ?? []).map((s, i) => (
                        <li key={i}>
                          <span className="eval-snippet-meta">
                            [{s.source_type}] score={s.score.toFixed(2)}
                          </span>
                          {s.content}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="eval-result-reasoning">
                  <strong>Judge reasoning:</strong>
                  <p>{r.reasoning}</p>
                </div>
                {runView.evaluation_type === EVAL_TYPE_SEARCH && r.search_results.length > 0 && (
                  <div className="eval-result-snippets">
                    <strong>Top search results:</strong>
                    <ul>
                      {r.search_results.map((s, i) => (
                        <li key={i}>
                          <span className="eval-snippet-meta">
                            [{s.source_type}] score={s.score.toFixed(2)}
                          </span>
                          {s.content}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {runView && runView.results.length === 0 && (
        <section className="eval-detail-section eval-results-section">
          <h2>Run detail</h2>
          <p className="eval-empty-text">
            Run <code>{runView.run_id}</code> has no item results ({runView.status}).
            {runView.error_message ? (
              <>
                {' '}
                <span className="eval-run-error">{runView.error_message}</span>
              </>
            ) : null}
          </p>
        </section>
      )}

      {(showItemForm || editItem) && (
        <div className="eval-dialog-overlay" onClick={closeItemForm}>
          <div className="eval-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="eval-dialog-header">
              <h2>{editItem ? 'Edit Item' : 'Add Item'}</h2>
              <button type="button" className="eval-dialog-close" onClick={closeItemForm}>
                <X size={20} />
              </button>
            </div>
            <div className="eval-dialog-body">
              <label>
                <span>Topic (optional)</span>
                <input
                  type="text"
                  value={itemTopic}
                  onChange={(e) => setItemTopic(e.target.value)}
                  placeholder="e.g. 投保年龄"
                />
              </label>
              <label>
                <span>Query</span>
                <textarea
                  value={itemQuery}
                  onChange={(e) => setItemQuery(e.target.value)}
                  placeholder="Question to ask"
                  rows={3}
                />
              </label>
              <label>
                <span>Expected Answer</span>
                <textarea
                  value={itemExpected}
                  onChange={(e) => setItemExpected(e.target.value)}
                  placeholder="Expected answer"
                  rows={4}
                />
              </label>
            </div>
            <div className="eval-dialog-footer">
              <button type="button" className="btn btn-secondary" onClick={closeItemForm}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!itemQuery.trim() || !itemExpected.trim() || itemSaving}
                onClick={editItem ? handleUpdateItem : handleAddItem}
              >
                {itemSaving ? 'Saving...' : editItem ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
