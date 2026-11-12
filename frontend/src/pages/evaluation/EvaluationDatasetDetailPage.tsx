import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { fetchEvaluation, fetchEvaluationItems, type EvaluationResponse } from '../../data/evaluationsApi';
import { EntityViewLoading, EntityViewShell } from '../shared/EntityViewShell';
import { EvaluationDetailCtx, type EvaluationDetailContext } from './EvaluationDetailContext';
import './EvaluationDatasetDetail.scss';

/**
 * The evaluation's shell: one page per question, where there used to be one long page.
 *
 * Items, runs, a single run's results and the settings were stacked in one scroll; the stack grew a block per feature and
 * the run section alone carried the report, the results, the compare controls and a dialog. The tabs follow the catalog's
 * dataset page — same shell, same nav, one concern per screen.
 */
export function EvaluationDatasetDetailPage() {
  const { t } = useTranslation('workspace');
  const { id: evaluationId = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [dataset, setDataset] = useState<EvaluationResponse | null>(null);
  const [itemTotal, setItemTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!evaluationId) return;
    try {
      const [data, items] = await Promise.all([
        fetchEvaluation(evaluationId),
        fetchEvaluationItems(evaluationId, { limit: 1 }),
      ]);
      setDataset(data);
      setItemTotal(items.total);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('evaluationDetail.toastLoadDatasetFailed'));
      setDataset(null);
    } finally {
      setLoading(false);
    }
  }, [evaluationId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // `?run=<id>` was how a run was addressed before runs had their own route. Keep the old links working.
  const runFromUrl = searchParams.get('run');
  useEffect(() => {
    if (!runFromUrl || !evaluationId) return;
    navigate(`/evaluations/${evaluationId}/runs/${runFromUrl}`, { replace: true });
  }, [runFromUrl, evaluationId, navigate]);

  const context = useMemo<EvaluationDetailContext | null>(
    () => (dataset ? { evaluationId, dataset, itemTotal, reload: () => void load() } : null),
    [dataset, evaluationId, itemTotal, load],
  );

  if (loading) return <EntityViewLoading label={t('evaluationDetail.loading')} />;
  if (!dataset || !context) return <p className="page-subtitle">{t('evaluationDetail.notFound')}</p>;

  const base = `/evaluations/${evaluationId}`;
  const kindLabel =
    dataset.kind === 'query'
      ? t('evaluationDetail.kindQuery')
      : dataset.kind === 'content'
        ? t('evaluationDetail.kindContent')
        : t('evaluationDetail.kindAnswer');

  return (
    <EvaluationDetailCtx.Provider value={context}>
      <EntityViewShell
        backTo="/evaluations"
        backLabel={t('evaluationDetail.back')}
        title={dataset.name}
        meta={[dataset.knowledge_base_name || dataset.knowledge_base_id, kindLabel, t('evaluationDetail.itemCount', { count: itemTotal })]
          .filter(Boolean)
          .join(' · ')}
        navItems={[
          { to: base, label: t('evaluationDetail.tabOverview'), end: true },
          { to: `${base}/items`, label: t('evaluationDetail.tabItems') },
          { to: `${base}/runs`, label: t('evaluationDetail.tabRuns') },
          { to: `${base}/settings`, label: t('evaluationDetail.settings') },
          { to: `${base}/sharing`, label: t('evaluationSettings.sharing') },
        ]}
      >
        <Outlet />
      </EntityViewShell>
    </EvaluationDetailCtx.Provider>
  );
}
