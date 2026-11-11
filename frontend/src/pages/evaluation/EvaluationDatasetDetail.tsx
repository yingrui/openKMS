import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
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
  type EvaluationRunResult,
  type JudgeCheck,
} from '../../data/evaluationsApi';
import type { TFunction } from 'i18next';
import { PanelToolbar } from '../../styles/design-system';
import { expectedQueryLines } from './expectedQueryText';

const EVAL_TYPE_SEARCH = 'search_retrieval';
const EVAL_TYPE_QA = 'qa_answer';
const EVAL_TYPE_WIKI_COVERAGE = 'wiki_content_coverage';
const EVAL_TYPE_DATA_QUERY = 'data_query';

const isQueryKind = (kind: string | undefined) => (kind ?? 'answer') === 'query';

function evalShowsSearchSnippets(evaluationType: string): boolean {
  return evaluationType === EVAL_TYPE_SEARCH || evaluationType === EVAL_TYPE_WIKI_COVERAGE;
}

/** One result row: the verdict on the summary line, the evidence inside it. Passing items stay closed. */
function RunResultRow({ r, evaluationType, t }: { r: EvaluationRunResult; evaluationType: string; t: TFunction }) {
  const undecided = !r.pass && r.judge?.verdict === 'undecided';
  const outcome = r.pass ? 'pass' : undecided ? 'undecided' : 'fail';
  // The same difference can be reported for several expectations; show it once, with how many times it was found.
  const failing = (() => {
    const seen = new Map<string, { expectedIndex: number; check: JudgeCheck; count: number }>();
    for (const v of r.judge?.verdicts ?? []) {
      for (const c of v.checks ?? []) {
        if (c.verdict === 'pass') continue;
        const key = `${c.id}|${c.expected ?? ''}|${c.actual ?? ''}`;
        const hit = seen.get(key);
        if (hit) hit.count += 1;
        else seen.set(key, { expectedIndex: v.expected_index, check: c, count: 1 });
      }
    }
    return [...seen.values()];
  })();
  const isDataQuery = evaluationType === EVAL_TYPE_DATA_QUERY;

  return (
    <details className={`eval-result eval-result--${outcome}`} open={!r.pass}>
      <summary className="eval-result-summary">
        <span className={`eval-result-badge eval-result-${outcome}`}>
          {r.pass
            ? t('evaluationDetail.pass')
            : undecided
              ? t('evaluationDetail.undecided')
              : t('evaluationDetail.fail')}
        </span>
        <span className="eval-result-question" title={r.query}>
          {r.query}
        </span>
        {isDataQuery && r.coverage != null ? (
          <span className="eval-result-coverage">
            {t('evaluationDetail.coverageLabel', { percent: Math.round(r.coverage * 100) })}
          </span>
        ) : null}
        <span className="eval-result-score">{t('evaluationDetail.scoreShort', { score: r.score.toFixed(2) })}</span>
      </summary>

      <div className="eval-result-body">
        {failing.length > 0 ? (
          <div className="eval-diff-list">
            <span className="eval-body-label">{t('evaluationDetail.differencesLabel')}</span>
            {failing.map(({ expectedIndex, check, count }) => (
              <div key={`${expectedIndex}-${check.id}-${check.expected ?? ''}`} className={`eval-diff eval-diff--${check.verdict}`}>
                <span className="eval-diff-name">
                  {t(`evaluationDetail.judge.${check.id}`)}
                  {(r.judge?.verdicts?.length ?? 0) > 1 ? ` · #${expectedIndex + 1}` : ''}
                  {count > 1 ? ` ×${count}` : ''}
                </span>
                <span className="eval-diff-reason">
                  {check.reason ||
                    (check.verdict === 'unknown' ? t('evaluationDetail.undecided') : t('evaluationDetail.fail'))}
                </span>
                {check.expected || check.actual ? (
                  <span className="eval-diff-fragments">
                    {check.expected ? <code title={check.expected}>{check.expected}</code> : null}
                    {check.expected && check.actual ? <span aria-hidden>→</span> : null}
                    {check.actual ? <code title={check.actual}>{check.actual}</code> : null}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="eval-pair">
          <div className="eval-pair-col">
            <span className="eval-body-label">
              {isDataQuery ? t('evaluationDetail.expectedQueryLabel') : t('evaluationDetail.expectedLabel')}
            </span>
            {isDataQuery ? (
              <ul className="eval-item-expected-list">
                {expectedQueryLines(r.expected_query).map((line, i) => (
                  <li key={`exp-${i}`} title={line}>
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="eval-pair-text">{r.expected_answer}</p>
            )}
          </div>
          {isDataQuery ? (
            <div className="eval-pair-col">
              <span className="eval-body-label">
                {t('evaluationDetail.citedQueriesLabel', { count: r.data_queries?.length ?? 0 })}
              </span>
              {(r.data_queries ?? []).map((dq, i) => (
                <div key={`dq-${i}`} className="eval-data-query">
                  <span className="eval-data-query-meta">
                    {dq.metric ?? dq.mode ?? 'sql'}
                    {dq.model_id ? ` · ${dq.model_id.slice(0, 8)}…` : ''}
                  </span>
                  <pre className="eval-data-query-sql">{dq.sql}</pre>
                </div>
              ))}
              {(r.data_queries?.length ?? 0) === 0 ? (
                <p className="eval-pair-text">{t('evaluationDetail.noQueriesCited')}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {evaluationType === EVAL_TYPE_QA && r.generated_answer ? (
          <div>
            <span className="eval-body-label">{t('evaluationDetail.generatedAnswer')}</span>
            <p className="eval-pair-text">{r.generated_answer}</p>
          </div>
        ) : null}

        {failing.length === 0 ? (
          <p className="eval-result-note">{r.reasoning}</p>
        ) : null}

        {evalShowsSearchSnippets(evaluationType) && r.search_results.length > 0 ? (
          <details className="eval-snippets">
            <summary>
              {t('evaluationDetail.topSearchResults')} · {r.search_results.length}
            </summary>
            <ol>
              {r.search_results.map((sn, i) => (
                <li key={`sn-${i}`}>
                  <span className="eval-snippet-meta">
                    {t('evaluationDetail.snippetMeta', { type: sn.source_type, score: sn.score.toFixed(2) })}
                  </span>
                  {sn.content}
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </div>
    </details>
  );
}

/** Which runs a dataset's items support. Mirrors `KIND_RUN_TYPES` on the backend. */
const RUN_TYPES_BY_KIND: Record<string, string[]> = {
  answer: [EVAL_TYPE_SEARCH, EVAL_TYPE_QA],
  query: [EVAL_TYPE_DATA_QUERY],
  content: [EVAL_TYPE_WIKI_COVERAGE],
};

const DEFAULT_ITEMS_PAGE_SIZE = 10;

import './EvaluationDatasetDetail.scss';

export function EvaluationDatasetDetail() {
  const { t } = useTranslation('workspace');
  const { id: evaluationId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const runFromUrl = searchParams.get('run');
  const compareFromUrl = searchParams.get('compare');
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

  // The kind decides which runs make sense; a query set defaulting to retrieval ran into a page of failures.
  useEffect(() => {
    if (!dataset) return;
    const allowed = RUN_TYPES_BY_KIND[dataset.kind ?? 'answer'] ?? [EVAL_TYPE_SEARCH];
    if (!allowed.includes(evaluationType)) setEvaluationType(allowed[0]);
  }, [dataset, evaluationType]);

  useEffect(() => {
    if (!compareFromUrl) return;
    const [a, b] = compareFromUrl.split(',').map((s) => s.trim());
    if (a) setCompareRunA(a);
    if (b) setCompareRunB(b);
  }, [compareFromUrl]);

  useEffect(() => {
    if (!evaluationId || !runFromUrl) return;
    if (runView?.run_id === runFromUrl) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await getEvaluationRun(evaluationId, runFromUrl);
        if (!cancelled) setRunView(res);
      } catch {
        if (!cancelled) {
          toast.error(t('evaluationDetail.toastLoadRunFailed'));
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.delete('run');
              return next;
            },
            { replace: true },
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [evaluationId, runFromUrl, runView?.run_id, setSearchParams, t]);

  const setRunInUrl = useCallback(
    (runId: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (runId) next.set('run', runId);
          else next.delete('run');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

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
    if (!evaluationId || !editItem || !itemQuery.trim()) return;
    if (!isQueryKind(dataset?.kind) && !itemExpected.trim()) return;
    setItemSaving(true);
    try {
      await updateEvaluationItem(evaluationId, editItem.id, {
        query: itemQuery.trim(),
        ...(isQueryKind(dataset?.kind) ? {} : { expected_answer: itemExpected.trim() }),
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
    setItemExpected(item.expected_answer ?? '');
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
      setRunInUrl(res.run_id);
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
      setRunInUrl(runId);
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
      if (runView?.run_id === runId) {
        setRunView(null);
        setRunInUrl(null);
      }
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
              className="openkms-hidden"
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
            {/* A CSV carries answers; a query item's ground truth is a query. */}
            {isQueryKind(dataset.kind) ? null : (
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
            )}
            {isQueryKind(dataset.kind) ? null : (
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
            )}
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

      <div className={`ds-table-wrap${itemsLoading ? ' ds-table-wrap--loading' : ''}`}>
        <table className="eval-items-table">
          <thead>
            <tr>
              <th>{t('evaluationDetail.colTopic')}</th>
              <th>{t('evaluationDetail.colQuery')}</th>
              <th>{isQueryKind(dataset.kind) ? t('evaluationDetail.colExpectedQuery') : t('evaluationDetail.colExpected')}</th>
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
                  <td className="eval-item-expected">
                    {isQueryKind(dataset.kind) ? (
                      (() => {
                        const lines = expectedQueryLines(item.expected_query);
                        if (lines.length === 0) {
                          return <span className="eval-item-expected-missing">{t('evaluationDetail.expectedQueryMissing')}</span>;
                        }
                        return (
                          <ul className="eval-item-expected-list">
                            {lines.map((line, i) => (
                              <li key={`${item.id}-exp-${i}`} title={line}>
                                {line}
                              </li>
                            ))}
                          </ul>
                        );
                      })()
                    ) : (
                      item.expected_answer
                    )}
                  </td>
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
        <PanelToolbar
          className="eval-detail-subsection-header"
          leading={<span className="eval-detail-subsection-title">{t('evaluationDetail.runHistory')}</span>}
          actions={
            <div className="eval-run-controls">
              <label className="eval-run-type">
                <span>{t('evaluationDetail.typeLabel')}</span>
                <select
                  value={evaluationType}
                  onChange={(e) => setEvaluationType(e.target.value)}
                  disabled={running}
                  className="eval-detail-type-select"
                >
                  {(RUN_TYPES_BY_KIND[dataset.kind ?? 'answer'] ?? [EVAL_TYPE_SEARCH]).map((type) => (
                    <option key={type} value={type}>
                      {type === EVAL_TYPE_SEARCH
                        ? t('evaluationDetail.evalTypeSearch')
                        : type === EVAL_TYPE_QA
                          ? t('evaluationDetail.evalTypeQa')
                          : type === EVAL_TYPE_WIKI_COVERAGE
                            ? t('evaluationDetail.evalTypeWikiCoverage')
                            : t('evaluationDetail.evalTypeDataQuery')}
                    </option>
                  ))}
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
          }
        />
        {itemsTotal === 0 && (
          <p className="eval-run-hint">{t('evaluationDetail.runNeedsItems')}</p>
        )}
        {runs.length === 0 ? (
          <p className="eval-empty-text">{t('evaluationDetail.emptyRuns')}</p>
        ) : (
          <div className="ds-table-wrap">
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
          <div className="ds-table-wrap eval-compare-table-wrap">
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
          {(() => {
            const undecidedCount = runView.results.filter((r) => !r.pass && r.judge?.verdict === 'undecided').length;
            const failCount = runView.results.filter((r) => !r.pass).length - undecidedCount;
            const judge = runView.results.find((r) => r.judge?.model)?.judge;
            return (
              <>
                <div className="eval-run-head">
                  <h2>{t('evaluationDetail.runDetail')}</h2>
                  <div className="eval-run-chips">
                    <span className="eval-result-badge eval-result-pass">
                      {t('evaluationDetail.runPassChip', { count: runView.pass_count })}
                    </span>
                    {failCount > 0 ? (
                      <span className="eval-result-badge eval-result-fail">
                        {t('evaluationDetail.runFailChip', { count: failCount })}
                      </span>
                    ) : null}
                    {undecidedCount > 0 ? (
                      <span className="eval-result-badge eval-result-undecided">
                        {t('evaluationDetail.runUndecidedChip', { count: undecidedCount })}
                      </span>
                    ) : null}
                    <span className="eval-run-avg">
                      {t('evaluationDetail.runAvgShort', {
                        avg: runView.avg_score != null ? runView.avg_score.toFixed(2) : t('shared.dash'),
                      })}
                    </span>
                  </div>
                </div>
                <p className="eval-run-meta">
                  <code>{runView.run_id}</code> · {runView.evaluation_type} · {runView.status}
                  {judge?.model ? ` · ${t('evaluationDetail.judgedBy', { model: judge.model })}` : ''}
                  {judge?.prompt_version ? ` · ${judge.prompt_version}` : ''}
                </p>
                <div className="eval-results-list">
                  {runView.results.map((r) => (
                    <RunResultRow key={r.item_id} r={r} evaluationType={runView.evaluation_type} t={t} />
                  ))}
                </div>
              </>
            );
          })()}
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
              <button
          type="button"
          className="eval-dialog-close"
          aria-label={t('shared.close')} onClick={closeItemForm}>
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
              {isQueryKind(dataset?.kind) ? (
                <div className="eval-dialog-expected-readonly">
                  <span>{t('evaluationDetail.expectedLabelForm')}</span>
                  <ul>
                    {expectedQueryLines(editItem?.expected_query).map((line, i) => (
                      <li key={`dlg-exp-${i}`}>{line}</li>
                    ))}
                  </ul>
                  <small>{t('evaluationDetail.expectedQueryEditHint')}</small>
                </div>
              ) : (
                <label>
                  <span>{t('evaluationDetail.expectedLabelForm')}</span>
                  <textarea
                    value={itemExpected}
                    onChange={(e) => setItemExpected(e.target.value)}
                    placeholder={t('evaluationDetail.expectedPlaceholder')}
                    rows={4}
                  />
                </label>
              )}
            </div>
            <div className="eval-dialog-footer">
              <button type="button" className="btn btn-secondary" onClick={closeItemForm}>
                {t('evaluationDetail.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  !itemQuery.trim() || (!isQueryKind(dataset?.kind) && !itemExpected.trim()) || itemSaving
                }
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
