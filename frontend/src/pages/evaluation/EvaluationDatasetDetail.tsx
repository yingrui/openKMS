import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  X,
  Play,
  Loader2,
  Settings,
  Upload,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchEvaluation,
  fetchEvaluationItems,
  createEvaluationItem,
  updateEvaluationItem,
  deleteEvaluationItem,
  importEvaluationItems,
  runEvaluation,
  listEvaluationRuns,
  getEvaluationRun,
  deleteEvaluationRun,
  compareEvaluationRuns,
  type EvaluationResponse,
  type EvaluationItemResponse,
  type EvaluationRunResponse,
  type EvaluationRunListItem,
  type EvaluationCompareResponse,
} from '../../data/evaluationsApi';

const EVAL_TYPE_SEARCH = 'search_retrieval';
const EVAL_TYPE_QA = 'qa_answer';
const EVAL_TYPE_WIKI_COVERAGE = 'wiki_content_coverage';

function evalShowsSearchSnippets(evaluationType: string): boolean {
  return evaluationType === EVAL_TYPE_SEARCH || evaluationType === EVAL_TYPE_WIKI_COVERAGE;
}

const DEFAULT_ITEMS_PAGE_SIZE = 10;

import './EvaluationDatasetDetail.css';

export function EvaluationDatasetDetail() {
  const { t } = useTranslation('workspace');
  const { id: evaluationId } = useParams<{ id: string }>();
  const [dataset, setDataset] = useState<EvaluationResponse | null>(null);
  const [items, setItems] = useState<EvaluationItemResponse[]>([]);
  const [itemsTotal, setItemsTotal] = useState(0);
  const [itemsPage, setItemsPage] = useState(0);
  const [itemsPageSize, setItemsPageSize] = useState(DEFAULT_ITEMS_PAGE_SIZE);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showItemForm, setShowItemForm] = useState(false);
  const [editItem, setEditItem] = useState<EvaluationItemResponse | null>(null);
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
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);

  const loadDataset = useCallback(async () => {
    if (!evaluationId) return;
    try {
      const data = await fetchEvaluation(evaluationId);
      setDataset(data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('evaluationDetail.toastLoadDatasetFailed'));
    } finally {
      setLoading(false);
    }
  }, [evaluationId, t]);

  const fetchItemsForPage = useCallback(
    async (page: number) => {
      if (!evaluationId) return;
      setItemsLoading(true);
      try {
        const offset = page * itemsPageSize;
        const res = await fetchEvaluationItems(evaluationId, { offset, limit: itemsPageSize });
        if (res.items.length === 0 && res.total > 0 && page > 0) {
          const lastPage = Math.max(0, Math.ceil(res.total / itemsPageSize) - 1);
          await fetchItemsForPage(lastPage);
          return;
        }
        setItems(res.items);
        setItemsTotal(res.total);
        setItemsPage(page);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t('evaluationDetail.toastLoadItemsFailed'));
      } finally {
        setItemsLoading(false);
      }
    },
    [evaluationId, itemsPageSize, t]
  );

  useEffect(() => {
    loadDataset();
  }, [loadDataset]);

  useEffect(() => {
    if (evaluationId) fetchItemsForPage(itemsPage);
  }, [evaluationId, itemsPage, itemsPageSize, fetchItemsForPage]);

  const loadRuns = useCallback(async () => {
    if (!evaluationId) return;
    setRunsLoading(true);
    try {
      const res = await listEvaluationRuns(evaluationId, { limit: 100 });
      setRuns(res.items);
    } catch {
      setRuns([]);
    } finally {
      setRunsLoading(false);
    }
  }, [evaluationId]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (
      dataset &&
      evaluationType === EVAL_TYPE_WIKI_COVERAGE &&
      !dataset.wiki_space_id
    ) {
      setEvaluationType(EVAL_TYPE_SEARCH);
    }
  }, [dataset, evaluationType]);

  const handleAddItem = async () => {
    if (!evaluationId || !itemQuery.trim() || !itemExpected.trim()) return;
    setItemSaving(true);
    try {
      await createEvaluationItem(evaluationId, {
        query: itemQuery.trim(),
        expected_answer: itemExpected.trim(),
        topic: itemTopic.trim() || undefined,
      });
      setShowItemForm(false);
      setItemQuery('');
      setItemExpected('');
      setItemTopic('');
      toast.success(t('evaluationDetail.toastAddSuccess'));
      await fetchItemsForPage(itemsPage);
      loadDataset();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('evaluationDetail.toastAddFailed'));
    } finally {
      setItemSaving(false);
    }
  };

  const handleUpdateItem = async () => {
    if (!evaluationId || !editItem || !itemQuery.trim() || !itemExpected.trim()) return;
    setItemSaving(true);
    try {
      await updateEvaluationItem(evaluationId, editItem.id, {
        query: itemQuery.trim(),
        expected_answer: itemExpected.trim(),
        topic: itemTopic.trim() || undefined,
      });
      setEditItem(null);
      setItemQuery('');
      setItemExpected('');
      setItemTopic('');
      toast.success(t('evaluationDetail.toastUpdateSuccess'));
      await fetchItemsForPage(itemsPage);
      loadDataset();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('evaluationDetail.toastUpdateFailed'));
    } finally {
      setItemSaving(false);
    }
  };

  const handleDeleteItem = async (item: EvaluationItemResponse) => {
    if (!evaluationId || !confirm(t('evaluationDetail.deleteItemConfirm'))) return;
    try {
      await deleteEvaluationItem(evaluationId, item.id);
      toast.success(t('evaluationDetail.toastItemDeleted'));
      await fetchItemsForPage(itemsPage);
      loadDataset();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('evaluationDetail.toastDeleteItemFailed'));
    }
  };

  const openEditItem = (item: EvaluationItemResponse) => {
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
    if (!evaluationId || !file) return;
    e.target.value = '';
    setImporting(true);
    try {
      const res = await importEvaluationItems(evaluationId, file);
      toast.success(t('evaluationDetail.toastImported', { count: res.imported }));
      loadDataset();
      await fetchItemsForPage(0);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('evaluationDetail.toastImportFailed'));
    } finally {
      setImporting(false);
    }
  };

  const handleRunEvaluation = async () => {
    if (!evaluationId) return;
    setRunning(true);
    setRunView(null);
    try {
      const res = await runEvaluation(evaluationId, { evaluation_type: evaluationType });
      setRunView(res);
      toast.success(
        t('evaluationDetail.toastRunSuccess', {
          runId: `${res.run_id.slice(0, 8)}…`,
          pass: res.pass_count,
          total: res.item_count,
        }),
      );
      loadRuns();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('evaluationDetail.toastRunFailed'));
    } finally {
      setRunning(false);
    }
  };

  const handleLoadRun = async (runId: string) => {
    if (!evaluationId) return;
    try {
      const res = await getEvaluationRun(evaluationId, runId);
      setRunView(res);
      toast.success(t('evaluationDetail.toastLoadedRun'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('evaluationDetail.toastLoadRunFailed'));
    }
  };

  const handleDeleteRun = async (runId: string) => {
    if (!evaluationId || !confirm(t('evaluationDetail.deleteRunConfirm'))) return;
    setDeletingRunId(runId);
    try {
      await deleteEvaluationRun(evaluationId, runId);
      if (runView?.run_id === runId) setRunView(null);
      if (compareRunA === runId) setCompareRunA('');
      if (compareRunB === runId) setCompareRunB('');
      if (
        compareData &&
        (compareData.run_a_id === runId || compareData.run_b_id === runId)
      ) {
        setCompareData(null);
      }
      toast.success(t('evaluationDetail.toastRunDeleted'));
      await loadRuns();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('evaluationDetail.toastDeleteRunFailed'));
    } finally {
      setDeletingRunId(null);
    }
  };

  const handleCompare = async () => {
    if (!evaluationId || !compareRunA || !compareRunB || compareRunA === compareRunB) {
      toast.error(t('evaluationDetail.toastPickTwoRuns'));
      return;
    }
    setCompareLoading(true);
    setCompareData(null);
    try {
      const res = await compareEvaluationRuns(evaluationId, compareRunA, compareRunB);
      setCompareData(res);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('evaluationDetail.toastCompareFailed'));
    } finally {
      setCompareLoading(false);
    }
  };

  if (loading || !dataset) {
    return (
      <div className="eval-detail">
        <p className="eval-detail-loading">{t('evaluationDetail.loading')}</p>
      </div>
    );
  }

  return (
    <div className="eval-detail">
      <div className="eval-detail-header">
        <Link to="/evaluations" className="eval-back">
          <ArrowLeft size={18} />
          <span>{t('evaluationDetail.back')}</span>
        </Link>
        <div className="eval-detail-title-row">
          <h1>{dataset.name}</h1>
          <div className="eval-detail-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleImportFile}
              style={{ display: 'none' }}
              aria-hidden
            />
            <Link
              to={`/evaluations/${evaluationId}/settings`}
              className="btn btn-secondary"
              title={t('evaluationDetail.settings')}
            >
              <Settings size={18} />
              <span>{t('evaluationDetail.settings')}</span>
            </Link>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleImportClick}
              disabled={importing}
              title={t('evaluationDetail.importData')}
            >
              {importing ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              <span>{importing ? t('evaluationDetail.importing') : t('evaluationDetail.importData')}</span>
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setShowItemForm(true);
                setItemQuery('');
                setItemExpected('');
                setItemTopic('');
              }}
            >
              <Plus size={18} />
              <span>{t('evaluationDetail.addItem')}</span>
            </button>
          </div>
        </div>
        <p className="eval-detail-meta">
          {dataset.wiki_space_name
            ? t('evaluationDetail.metaLineWithWiki', {
                kb: dataset.knowledge_base_name || dataset.knowledge_base_id,
                wiki: dataset.wiki_space_name,
                count: itemsTotal,
              })
            : t('evaluationDetail.metaLine', {
                kb: dataset.knowledge_base_name || dataset.knowledge_base_id,
                count: itemsTotal,
              })}
        </p>
        {dataset.description && <p className="eval-detail-desc">{dataset.description}</p>}
        <p className="eval-import-csv-hint">{t('evaluationDetail.importCsvHint')}</p>
      </div>

      <div className={`eval-items-table-wrapper${itemsLoading ? ' eval-items-table-wrapper--loading' : ''}`}>
        <table className="eval-items-table">
          <thead>
            <tr>
              <th>{t('evaluationDetail.colTopic')}</th>
              <th>{t('evaluationDetail.colQuery')}</th>
              <th>{t('evaluationDetail.colExpected')}</th>
              <th className="eval-items-actions-col" />
            </tr>
          </thead>
          <tbody>
            {itemsLoading && items.length === 0 ? (
              <tr>
                <td colSpan={4} className="eval-items-empty">
                  <span className="eval-items-loading">
                    <Loader2 size={18} className="animate-spin" />
                    {t('evaluationDetail.loadingItems')}
                  </span>
                </td>
              </tr>
            ) : itemsTotal === 0 ? (
              <tr>
                <td colSpan={4} className="eval-items-empty">
                  {t('evaluationDetail.emptyItems')}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td className="eval-item-topic">{item.topic ?? t('shared.dash')}</td>
                  <td className="eval-item-query">{item.query}</td>
                  <td className="eval-item-expected">{item.expected_answer}</td>
                  <td className="eval-items-actions-col">
                    <button
                      type="button"
                      title={t('shared.edit')}
                      aria-label={t('shared.edit')}
                      onClick={() => openEditItem(item)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      title={t('shared.delete')}
                      aria-label={t('shared.delete')}
                      onClick={() => handleDeleteItem(item)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {itemsTotal > 0 && (() => {
        const totalPages = Math.max(1, Math.ceil(itemsTotal / itemsPageSize));
        const from = itemsPage * itemsPageSize + 1;
        const to = Math.min((itemsPage + 1) * itemsPageSize, itemsTotal);
        return (
          <div className="eval-items-pagination">
            <div className="eval-items-pagination-info">
              <span>
                {t('evaluationDetail.paginationRange', { from, to, total: itemsTotal })}
              </span>
              <label>
                <span>{t('evaluationDetail.perPage')}</span>
                <select
                  value={itemsPageSize}
                  onChange={(e) => {
                    setItemsPageSize(Number(e.target.value));
                    setItemsPage(0);
                  }}
                  aria-label={t('evaluationDetail.itemsPerPageAria')}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
            </div>
            {totalPages > 1 && (
              <div className="eval-items-pagination-nav">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={itemsPage <= 0 || itemsLoading}
                  onClick={() => setItemsPage((p) => Math.max(0, p - 1))}
                  aria-label={t('evaluationDetail.prevPageAria')}
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="eval-items-pagination-page">
                  {t('evaluationDetail.pageOf', { current: itemsPage + 1, total: totalPages })}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={itemsPage >= totalPages - 1 || itemsLoading}
                  onClick={() => setItemsPage((p) => p + 1)}
                  aria-label={t('evaluationDetail.nextPageAria')}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
        );
      })()}

      <section className="eval-detail-subsection">
        <div className="eval-detail-subsection-header">
          <h2>{t('evaluationDetail.runHistory')}</h2>
          <div className="eval-run-controls">
            <label className="eval-run-type">
              <span>{t('evaluationDetail.typeLabel')}</span>
              <select
                value={evaluationType}
                onChange={(e) => setEvaluationType(e.target.value)}
                disabled={running}
                className="eval-detail-type-select"
              >
                <option value={EVAL_TYPE_SEARCH}>{t('evaluationDetail.evalTypeSearch')}</option>
                <option value={EVAL_TYPE_QA}>{t('evaluationDetail.evalTypeQa')}</option>
                <option value={EVAL_TYPE_WIKI_COVERAGE} disabled={!dataset.wiki_space_id}>
                  {t('evaluationDetail.evalTypeWikiCoverage')}
                </option>
              </select>
            </label>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRunEvaluation}
              disabled={running || itemsTotal === 0}
              title={itemsTotal === 0 ? t('evaluationDetail.runNeedsItems') : undefined}
            >
              {running ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
              <span>{running ? t('evaluationDetail.running') : t('evaluationDetail.runEvaluation')}</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => loadRuns()}
              disabled={runsLoading}
            >
              {runsLoading ? <Loader2 size={18} className="animate-spin" /> : null}
              <span>{t('shared.refresh')}</span>
            </button>
          </div>
        </div>
        {itemsTotal === 0 && (
          <p className="eval-run-hint">{t('evaluationDetail.runNeedsItems')}</p>
        )}
        {runs.length === 0 ? (
          <p className="eval-empty-text">{t('evaluationDetail.emptyRuns')}</p>
        ) : (
          <div className="eval-items-table-wrapper">
            <table className="eval-items-table eval-runs-table">
              <thead>
                <tr>
                  <th>{t('evaluationDetail.colWhen')}</th>
                  <th>{t('evaluationDetail.colType')}</th>
                  <th>{t('evaluationDetail.colPass')}</th>
                  <th>{t('evaluationDetail.colAvgScore')}</th>
                  <th>{t('evaluationDetail.colStatus')}</th>
                  <th className="eval-items-actions-col" />
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
                    <td>{r.avg_score != null ? r.avg_score.toFixed(2) : t('shared.dash')}</td>
                    <td>{r.status}</td>
                    <td className="eval-items-actions-col">
                      <button
                        type="button"
                        title={t('evaluationDetail.viewTitle')}
                        aria-label={t('evaluationDetail.viewRunAria')}
                        onClick={() => handleLoadRun(r.id)}
                        disabled={deletingRunId === r.id}
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        type="button"
                        title={t('evaluationDetail.deleteRunTitle')}
                        aria-label={t('evaluationDetail.deleteRunAria')}
                        onClick={() => handleDeleteRun(r.id)}
                        disabled={deletingRunId === r.id}
                      >
                        {deletingRunId === r.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="eval-detail-subsection">
        <h2>{t('evaluationDetail.compareRuns')}</h2>
        <p className="eval-compare-hint">
          {t('evaluationDetail.compareHint')}
        </p>
        <div className="eval-compare-controls">
          <label>
            <span>{t('evaluationDetail.runA')}</span>
            <select
              value={compareRunA}
              onChange={(e) => setCompareRunA(e.target.value)}
              className="eval-compare-select"
            >
              <option value="">{t('shared.dash')}</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {new Date(r.created_at).toLocaleString()} · {r.evaluation_type}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('evaluationDetail.runB')}</span>
            <select
              value={compareRunB}
              onChange={(e) => setCompareRunB(e.target.value)}
              className="eval-compare-select"
            >
              <option value="">{t('shared.dash')}</option>
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
            <span>{compareLoading ? t('evaluationDetail.comparing') : t('evaluationDetail.compare')}</span>
          </button>
        </div>
        {compareData && compareData.rows.length > 0 && (
          <div className="eval-items-table-wrapper eval-compare-table-wrap">
            <table className="eval-items-table">
              <thead>
                <tr>
                  <th>{t('evaluationDetail.compareColQuery')}</th>
                  <th>{t('evaluationDetail.compareColPassA')}</th>
                  <th>{t('evaluationDetail.compareColScoreA')}</th>
                  <th>{t('evaluationDetail.compareColPassB')}</th>
                  <th>{t('evaluationDetail.compareColScoreB')}</th>
                  <th>{t('evaluationDetail.compareColDelta')}</th>
                  <th>{t('evaluationDetail.compareColPassChanged')}</th>
                </tr>
              </thead>
              <tbody>
                {compareData.rows.map((row) => (
                  <tr key={row.evaluation_item_id}>
                    <td className="eval-table-query">{row.query.slice(0, 120)}{row.query.length > 120 ? '…' : ''}</td>
                    <td>{row.pass_a ? t('shared.yes') : t('shared.no')}</td>
                    <td>{row.score_a.toFixed(2)}</td>
                    <td>{row.pass_b ? t('shared.yes') : t('shared.no')}</td>
                    <td>{row.score_b.toFixed(2)}</td>
                    <td>{row.score_delta >= 0 ? '+' : ''}{row.score_delta.toFixed(2)}</td>
                    <td>{row.pass_changed ? t('shared.yes') : t('shared.no')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {runView && runView.results.length > 0 && (
        <section className="eval-detail-section eval-results-section">
          <h2>{t('evaluationDetail.runDetail')}</h2>
          <div className="eval-results-meta">
            <span>
              <strong>{t('evaluationDetail.runMetaRun')}</strong> <code>{runView.run_id}</code>
            </span>
            <span>
              <strong>{t('evaluationDetail.runMetaType')}</strong> <code>{runView.evaluation_type}</code>
            </span>
            <span>
              <strong>{t('evaluationDetail.runMetaStatus')}</strong> {runView.status}
            </span>
          </div>
          <div className="eval-results-summary">
            {t('evaluationDetail.resultsSummary', {
              pass: runView.pass_count,
              total: runView.item_count,
              avg:
                runView.avg_score != null ? runView.avg_score.toFixed(2) : t('shared.dash'),
            })}
          </div>
          <div className="eval-results-list">
            {runView.results.map((r) => (
              <div key={r.item_id} className="eval-result-item">
                <div className="eval-result-header">
                  <span className={`eval-result-badge ${r.pass ? 'eval-result-pass' : 'eval-result-fail'}`}>
                    {r.pass ? t('evaluationDetail.pass') : t('evaluationDetail.fail')}
                  </span>
                  <span className="eval-result-score">
                    {t('evaluationDetail.scoreShort', { score: r.score.toFixed(2) })}
                  </span>
                </div>
                <div className="eval-result-query">
                  <strong>{t('evaluationDetail.queryLabel')}</strong> {r.query}
                </div>
                <div className="eval-result-expected">
                  <strong>{t('evaluationDetail.expectedLabel')}</strong>
                  <p>{r.expected_answer}</p>
                </div>
                {runView.evaluation_type === EVAL_TYPE_QA && r.generated_answer != null && r.generated_answer !== '' && (
                  <div className="eval-result-generated">
                    <strong>{t('evaluationDetail.generatedAnswer')}</strong>
                    <p>{r.generated_answer}</p>
                  </div>
                )}
                {runView.evaluation_type === EVAL_TYPE_QA && (r.qa_sources?.length ?? 0) > 0 && (
                  <div className="eval-result-snippets">
                    <strong>{t('evaluationDetail.sourcesLabel')}</strong>
                    <ul>
                      {(r.qa_sources ?? []).map((s, i) => (
                        <li key={i}>
                          <span className="eval-snippet-meta">
                            {t('evaluationDetail.snippetMeta', {
                              type: s.source_type,
                              score: s.score.toFixed(2),
                            })}
                          </span>
                          {s.content}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="eval-result-reasoning">
                  <strong>{t('evaluationDetail.judgeReasoning')}</strong>
                  <p>{r.reasoning}</p>
                </div>
                {evalShowsSearchSnippets(runView.evaluation_type) && r.search_results.length > 0 && (
                  <div className="eval-result-snippets">
                    <strong>{t('evaluationDetail.topSearchResults')}</strong>
                    <ul>
                      {r.search_results.map((s, i) => (
                        <li key={i}>
                          <span className="eval-snippet-meta">
                            {t('evaluationDetail.snippetMeta', {
                              type: s.source_type,
                              score: s.score.toFixed(2),
                            })}
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
          <h2>{t('evaluationDetail.runDetail')}</h2>
          <p className="eval-empty-text">
            {t('evaluationDetail.runEmpty', { runId: runView.run_id, status: runView.status })}
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
              <h2>{editItem ? t('evaluationDetail.dialogEditItem') : t('evaluationDetail.dialogAddItem')}</h2>
              <button type="button" className="eval-dialog-close" onClick={closeItemForm}>
                <X size={20} />
              </button>
            </div>
            <div className="eval-dialog-body">
              <label>
                <span>{t('evaluationDetail.topicOptional')}</span>
                <input
                  type="text"
                  value={itemTopic}
                  onChange={(e) => setItemTopic(e.target.value)}
                  placeholder={t('evaluationDetail.topicPlaceholder')}
                />
              </label>
              <label>
                <span>{t('evaluationDetail.queryLabelForm')}</span>
                <textarea
                  value={itemQuery}
                  onChange={(e) => setItemQuery(e.target.value)}
                  placeholder={t('evaluationDetail.queryPlaceholder')}
                  rows={3}
                />
              </label>
              <label>
                <span>{t('evaluationDetail.expectedLabelForm')}</span>
                <textarea
                  value={itemExpected}
                  onChange={(e) => setItemExpected(e.target.value)}
                  placeholder={t('evaluationDetail.expectedPlaceholder')}
                  rows={4}
                />
              </label>
            </div>
            <div className="eval-dialog-footer">
              <button type="button" className="btn btn-secondary" onClick={closeItemForm}>
                {t('evaluationDetail.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!itemQuery.trim() || !itemExpected.trim() || itemSaving}
                onClick={editItem ? handleUpdateItem : handleAddItem}
              >
                {itemSaving ? t('evaluationDetail.saving') : editItem ? t('evaluationDetail.save') : t('evaluationDetail.add')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
