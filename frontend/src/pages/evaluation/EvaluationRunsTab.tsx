import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Play, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteEvaluationRun, listEvaluationRuns, type EvaluationRunListItem } from '../../data/evaluationsApi';
import { RunEvaluationDialog } from './RunEvaluationDialog';
import { RUN_TYPES_BY_KIND, useEvaluationDetail } from './EvaluationDetailContext';
import { useEvaluationRun } from './useEvaluationRun';

/** The history, and the one button that adds to it. A run's results live on their own page. */
export function EvaluationRunsTab() {
  const { t } = useTranslation('workspace');
  const { evaluationId, dataset, itemTotal, reload } = useEvaluationDetail();
  const navigate = useNavigate();
  const allowedTypes = RUN_TYPES_BY_KIND[dataset.kind ?? 'answer'] ?? ['search_retrieval'];
  const [evaluationType, setEvaluationType] = useState<string>(allowedTypes[0]);

  useEffect(() => {
    if (!allowedTypes.includes(evaluationType)) setEvaluationType(allowedTypes[0]);
  }, [allowedTypes, evaluationType]);

  const [runs, setRuns] = useState<EvaluationRunListItem[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    if (!evaluationId) return;
    setRunsLoading(true);
    try {
      setRuns((await listEvaluationRuns(evaluationId, { limit: 100 })).items);
    } catch {
      setRuns([]);
    } finally {
      setRunsLoading(false);
    }
  }, [evaluationId]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  // The dialog, the queue and the poll: a finished run refreshes the history and opens its own page.
  const run = useEvaluationRun({
    evaluationId,
    evaluationType,
    onQueued: (runId) => {
      void loadRuns();
      reload();
      navigate(`/evaluations/${evaluationId}/runs/${runId}`);
    },
  });

  const removeRun = async (runId: string) => {
    setDeletingRunId(runId);
    try {
      await deleteEvaluationRun(evaluationId, runId);
      toast.success(t('evaluationDetail.toastRunDeleted'));
      await loadRuns();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('evaluationDetail.toastDeleteRunFailed'));
    } finally {
      setDeletingRunId(null);
    }
  };

  return (
    <div className="eval-tab">
      <div className="eval-tab-head">
        <p className="page-subtitle">{t('evaluationDetail.runsLead')}</p>
        <div className="eval-tab-actions">
          <label className="eval-run-type">
            <span>{t('evaluationDetail.typeLabel')}</span>
            <select
              value={evaluationType}
              onChange={(e) => setEvaluationType(e.target.value)}
              disabled={run.running}
              className="eval-detail-type-select ds-control"
            >
              {allowedTypes.map((type) => (
                <option key={type} value={type}>
                  {type === 'search_retrieval'
                    ? t('evaluationDetail.evalTypeSearch')
                    : type === 'qa_answer'
                      ? t('evaluationDetail.evalTypeQa')
                      : type === 'wiki_content_coverage'
                        ? t('evaluationDetail.evalTypeWikiCoverage')
                        : t('evaluationDetail.evalTypeDataQuery')}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={run.openDialog}
            disabled={run.running || itemTotal === 0}
            title={itemTotal === 0 ? t('evaluationDetail.runNeedsItems') : undefined}
          >
            {run.running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            <span>{run.running ? t('evaluationDetail.running') : t('evaluationDetail.runEvaluation')}</span>
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void loadRuns()} disabled={runsLoading}>
            {runsLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            <span>{t('shared.refresh')}</span>
          </button>
        </div>
      </div>

      {itemTotal === 0 ? <p className="eval-run-hint">{t('evaluationDetail.runNeedsItems')}</p> : null}
      {run.running ? (
        <p className="eval-run-hint eval-run-progress" role="status">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          {t('evaluationDetail.runInProgress', { seconds: run.elapsed })}
        </p>
      ) : null}

      {runs.length === 0 ? (
        <p className="page-subtitle">{t('evaluationDetail.emptyRuns')}</p>
      ) : (
        <div className="ds-table-wrap">
          <table className="eval-items-table eval-runs-table">
            <thead>
              <tr>
                <th>{t('evaluationDetail.runColWhen')}</th>
                <th>{t('evaluationDetail.runColType')}</th>
                <th>{t('evaluationDetail.runColStatus')}</th>
                <th>{t('evaluationDetail.runColResult')}</th>
                <th className="eval-items-actions-col" />
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.created_at).toLocaleString()}</td>
                  <td>{r.evaluation_type}</td>
                  <td>
                    <span className={`eval-run-status eval-run-status--${r.status}`}>{r.status}</span>
                  </td>
                  <td>
                    {r.pass_count}/{r.item_count}
                  </td>
                  <td className="eval-items-actions-col eval-run-row-actions">
                    <Link to={`/evaluations/${evaluationId}/runs/${r.id}`} className="btn btn-secondary btn-sm">
                      {t('evaluationDetail.openRun')}
                    </Link>
                    <button
                      type="button"
                      title={t('shared.delete')}
                      aria-label={t('shared.delete')}
                      disabled={deletingRunId === r.id}
                      onClick={() => void removeRun(r.id)}
                    >
                      {deletingRunId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {run.dialogOpen ? (
        <RunEvaluationDialog
          open
          evaluationId={evaluationId}
          itemsTotal={itemTotal}
          runs={runs}
          busy={run.running}
          onCancel={() => run.closeDialog()}
          onSubmit={(options) => void run.submit(options)}
        />
      ) : null}
    </div>
  );
}
