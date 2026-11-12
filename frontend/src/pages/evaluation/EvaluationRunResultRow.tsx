import { useTranslation } from 'react-i18next';
import type { EvaluationRunResult, JudgeCheck } from '../../data/evaluationsApi';
import { expectedQueryLines } from './expectedQueryText';

const EVAL_TYPE_SEARCH = 'search_retrieval';
const EVAL_TYPE_QA = 'qa_answer';
const EVAL_TYPE_WIKI_COVERAGE = 'wiki_content_coverage';
const EVAL_TYPE_DATA_QUERY = 'data_query';

function evalShowsSearchSnippets(evaluationType: string): boolean {
  return evaluationType === EVAL_TYPE_SEARCH || evaluationType === EVAL_TYPE_WIKI_COVERAGE;
}

export function RunResultRow({
  r,
  evaluationType,
  advice,
}: {
  r: EvaluationRunResult;
  evaluationType: string;
  /** Findings from the run report that name this item: what to change, and where. */
  advice: { area: string; claim: string; suggestion?: string | null }[];
}) {
  const { t } = useTranslation('workspace');
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
    <details id={`eval-result-${r.item_id}`} className={`eval-result eval-result--${outcome}`} open={!r.pass}>
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

        {advice.length > 0 ? (
          <div className="eval-advice">
            <span className="eval-body-label">{t('evaluationDetail.adviceLabel')}</span>
            {advice.map((a, i) => (
              <p key={`advice-${i}`} className="eval-advice-line">
                <span className="eval-report-area">{t(`evaluationDetail.reportArea.${a.area}`)}</span>
                {a.suggestion || a.claim}
              </p>
            ))}
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
