import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2 } from 'lucide-react';
import {
  compareEvaluationRuns,
  getEvaluationRun,
  listEvaluationRuns,
  type EvaluationCompareResponse,
  type EvaluationRunListItem,
  type EvaluationRunResponse,
} from '../../data/evaluationsApi';
import { RunResultRow } from './EvaluationRunResultRow';
import { useEvaluationDetail } from './EvaluationDetailContext';

/** One run, in full: its conclusion, its items, and (on request) how it differs from another. */
export function EvaluationRunDetailPage() {
  const { t } = useTranslation('workspace');
  const { evaluationId, itemTotal } = useEvaluationDetail();
  const { runId = '' } = useParams<{ runId: string }>();

  const [run, setRun] = useState<EvaluationRunResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [others, setOthers] = useState<EvaluationRunListItem[]>([]);
  const [compareWith, setCompareWith] = useState('');
  const [compare, setCompare] = useState<EvaluationCompareResponse | null>(null);
  const [comparing, setComparing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, runs] = await Promise.all([
        getEvaluationRun(evaluationId, runId),
        listEvaluationRuns(evaluationId, { limit: 100 }),
      ]);
      setRun(detail);
      setOthers(runs.items.filter((r) => r.id !== runId));
    } catch {
      setRun(null);
    } finally {
      setLoading(false);
    }
  }, [evaluationId, runId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runCompare = async () => {
    if (!compareWith) return;
    setComparing(true);
    try {
      setCompare(await compareEvaluationRuns(evaluationId, runId, compareWith));
    } catch {
      setCompare(null);
    } finally {
      setComparing(false);
    }
  };

  if (loading) {
    return (
      <p className="page-subtitle">
        <Loader2 size={14} className="animate-spin" aria-hidden /> {t('evaluationDetail.loading')}
      </p>
    );
  }
  if (!run) return <p className="page-subtitle">{t('evaluationDetail.runNotFound')}</p>;

  const undecided = run.results.filter((r) => !r.pass && r.judge?.verdict === 'undecided').length;
  const failed = run.results.filter((r) => !r.pass).length - undecided;
  const judge = run.results.find((r) => r.judge?.model)?.judge;

  return (
    <div className="eval-tab">
      <div className="eval-tab-head">
        <div>
          <Link to={`/evaluations/${evaluationId}/runs`} className="eval-back">
            <ArrowLeft size={16} />
            <span>{t('evaluationDetail.tabRuns')}</span>
          </Link>
          <p className="page-subtitle">
            <span className={`eval-run-status eval-run-status--${run.status}`}>{run.status}</span>{' '}
            {t('evaluationDetail.runScopeLine', { count: run.item_count, total: itemTotal })} ·{' '}
            {t('evaluationDetail.passLabel', { pass: run.pass_count, total: run.item_count })}
            {failed > 0 ? ` · ${t('evaluationDetail.runFailChip', { count: failed })}` : ''}
            {undecided > 0 ? ` · ${t('evaluationDetail.runUndecidedChip', { count: undecided })}` : ''}
          </p>
          <p className="eval-run-meta">
            <code>{run.run_id}</code> · {run.evaluation_type}
            {judge?.model ? ` · ${t('evaluationDetail.judgedBy', { model: judge.model })}` : ''}
            {judge?.prompt_version ? ` · ${judge.prompt_version}` : ''}
          </p>
        </div>
        {others.length > 0 ? (
          <div className="eval-tab-actions">
            <label className="eval-run-type">
              <span>{t('evaluationDetail.compareWith')}</span>
              <select
                className="ds-control"
                value={compareWith}
                onChange={(e) => {
                  setCompareWith(e.target.value);
                  setCompare(null);
                }}
              >
                <option value="">{t('shared.dash')}</option>
                {others.map((r) => (
                  <option key={r.id} value={r.id}>
                    {new Date(r.created_at).toLocaleString()} · {r.pass_count}/{r.item_count}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!compareWith || comparing}
              onClick={() => void runCompare()}
            >
              {comparing ? <Loader2 size={16} className="animate-spin" /> : null}
              <span>{t('evaluationDetail.compareRuns')}</span>
            </button>
          </div>
        ) : null}
      </div>

      {compare ? (
        <section className="account-card entity-view__panel">
          <table className="eval-items-table eval-runs-table">
            <thead>
              <tr>
                <th>{t('evaluationDetail.colQuery')}</th>
                <th>{t('evaluationDetail.compareThisRun')}</th>
                <th>{t('evaluationDetail.compareOtherRun')}</th>
              </tr>
            </thead>
            <tbody>
              {compare.rows.map((row) => (
                <tr key={row.evaluation_item_id}>
                  <td className="eval-item-query">{row.query}</td>
                  <td>{row.pass_a ? t('evaluationDetail.pass') : t('evaluationDetail.fail')}</td>
                  <td>{row.pass_b ? t('evaluationDetail.pass') : t('evaluationDetail.fail')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {run.report && (run.report.verdict || run.report.findings.length > 0) ? (
        <section className="account-card entity-view__panel">
          <div className="account-card-head">
            <h2 className="account-card-title">{t('evaluationDetail.reportTitle')}</h2>
          </div>
          {run.report.verdict ? <p className="eval-overview-verdict">{run.report.verdict}</p> : null}
          <ul className="eval-report-findings">
            {run.report.findings.map((f, i) => (
              <li key={`finding-${i}`} className={`eval-report-finding eval-report-finding--${f.area}`}>
                <div className="eval-report-finding-head">
                  <span className="eval-report-area">{t(`evaluationDetail.reportArea.${f.area}`)}</span>
                  <span className="eval-report-items">#{f.items.map((n) => n + 1).join(' #')}</span>
                </div>
                <p className="eval-report-claim">{f.claim}</p>
                {f.suggestion ? <p className="eval-report-suggestion">{f.suggestion}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="account-card entity-view__panel">
        <div className="account-card-head">
          <h2 className="account-card-title">{t('evaluationDetail.runDetail')}</h2>
        </div>
        {run.results.length === 0 ? (
          <p className="page-subtitle">{t('evaluationDetail.runEmpty', { runId: run.run_id, status: run.status })}</p>
        ) : (
          <div className="eval-results-list">
            {run.results.map((r, index) => (
              <RunResultRow
                key={r.item_id}
                r={r}
                evaluationType={run.evaluation_type}
                advice={(run.report?.findings ?? [])
                  .filter((f) => f.items.includes(index))
                  .map((f) => ({ area: f.area, claim: f.claim, suggestion: f.suggestion }))}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
