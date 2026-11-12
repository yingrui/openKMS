import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Loader2 } from 'lucide-react';
import {
  getEvaluationRun,
  listEvaluationRuns,
  type EvaluationRunListItem,
  type EvaluationRunResponse,
} from '../../data/evaluationsApi';
import { EmptyState, StatusChip } from '../../styles/design-system';
import { EntityViewPanel, EntityViewStat, EntityViewStats } from '../shared/EntityViewShell';
import { useEvaluationDetail } from './EvaluationDetailContext';

/** What this dataset is, and how the last run went. Everything else has its own page. */
export function EvaluationOverviewTab() {
  const { t } = useTranslation('workspace');
  const { evaluationId, dataset, itemTotal } = useEvaluationDetail();
  const [latest, setLatest] = useState<EvaluationRunResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const runs: EvaluationRunListItem[] = (await listEvaluationRuns(evaluationId, { limit: 1 })).items;
        if (!runs.length) return;
        const run = await getEvaluationRun(evaluationId, runs[0].id);
        if (!cancelled) setLatest(run);
      } catch {
        if (!cancelled) setLatest(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [evaluationId]);

  const base = `/evaluations/${evaluationId}`;
  const kind =
    dataset.kind === 'query'
      ? t('evaluationDetail.kindQuery')
      : dataset.kind === 'content'
        ? t('evaluationDetail.kindContent')
        : t('evaluationDetail.kindAnswer');

  return (
    <div className="eval-tab">
      <EntityViewStats>
        <EntityViewStat label={t('evaluationDetail.statItems')} value={itemTotal} />
        <EntityViewStat label={t('evaluationDetail.statKind')} value={kind} />
        <EntityViewStat
          label={t('evaluationDetail.statLastRun')}
          value={loading ? '…' : latest ? `${latest.pass_count}/${latest.item_count}` : t('shared.dash')}
        />
      </EntityViewStats>

      <EntityViewPanel
        title={t('evaluationDetail.lastRun')}
        description={t('evaluationDetail.lastRunHint')}
      >
        {loading ? (
          <p className="page-subtitle">
            <Loader2 size={14} className="animate-spin" aria-hidden /> {t('evaluationDetail.loading')}
          </p>
        ) : latest ? (
          <>
            <p className="eval-overview-line">
              <StatusChip tone={latest.status === 'completed' ? 'ok' : latest.status === 'failed' ? 'warn' : 'accent'}>
                {latest.status}
              </StatusChip>
              <span>
                {t('evaluationDetail.runScopeLine', { count: latest.item_count, total: itemTotal })} ·{' '}
                {t('evaluationDetail.passLabel', { pass: latest.pass_count, total: latest.item_count })}
              </span>
            </p>
            {latest.report?.verdict ? <p className="eval-overview-verdict">{latest.report.verdict}</p> : null}
            <p className="eval-overview-actions">
              <Link to={`${base}/runs/${latest.run_id}`} className="btn btn-secondary btn-sm">
                {t('evaluationDetail.openRun')} <ArrowRight size={14} aria-hidden />
              </Link>
            </p>
          </>
        ) : (
          <EmptyState title={t('evaluationDetail.emptyRuns')} description={t('evaluationDetail.emptyRunsHint')} />
        )}
      </EntityViewPanel>

      <EntityViewPanel title={t('evaluationDetail.about')} description={dataset.description ?? undefined}>
        <dl className="eval-overview-facts">
          <dt>{t('evaluationDetail.knowledgeBase')}</dt>
          <dd>{dataset.knowledge_base_name || dataset.knowledge_base_id}</dd>
          {dataset.wiki_space_name ? (
            <>
              <dt>{t('evaluationDetail.wikiSpace')}</dt>
              <dd>{dataset.wiki_space_name}</dd>
            </>
          ) : null}
          <dt>{t('evaluationDetail.itemKind')}</dt>
          <dd>{kind}</dd>
        </dl>
        <p className="eval-overview-actions">
          <Link to={`${base}/items`} className="btn btn-secondary btn-sm">
            {t('evaluationDetail.tabItems')}
          </Link>
          <Link to={`${base}/runs`} className="btn btn-secondary btn-sm">
            {t('evaluationDetail.tabRuns')}
          </Link>
        </p>
      </EntityViewPanel>
    </div>
  );
}
