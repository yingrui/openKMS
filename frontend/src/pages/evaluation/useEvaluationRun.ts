import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { listEvaluationRuns, runEvaluation, type EvaluationRunListItem } from '../../data/evaluationsApi';
import { RunRequestError, buildRunRequest } from './runRequest';
import type { RunOptions } from './RunEvaluationDialog';

/**
 * The run side of the evaluation page: which runs exist, the one being shown, and the one in flight.
 *
 * This was five pieces of state and two effects inside a 1200-line page. Kept together it reads as one lifecycle — queue,
 * follow, finish — and the page is left with the things it actually draws.
 */
export function useEvaluationRun({
  evaluationId,
  evaluationType,
  onQueued,
}: {
  evaluationId: string | undefined;
  /** The run type last chosen; the dialog does not change it, the toolbar does. */
  evaluationType: string;
  /** Called with the new run's id — the runs page opens it rather than polling here. */
  onQueued: (runId: string) => void;
}) {
  const { t } = useTranslation('workspace');
  const [runs, setRuns] = useState<EvaluationRunListItem[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);

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
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (!running || !startedAt) return;
    const id = window.setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [running, startedAt]);

  const openDialog = () => setDialogOpen(true);
  const closeDialog = () => setDialogOpen(false);

  const submit = useCallback(
    async ({ itemIds, judgeModelId, language }: RunOptions) => {
      if (!evaluationId) return;
      let body;
      try {
        body = buildRunRequest({
          scope: itemIds === null ? 'all' : 'failed',
          failedItemIds: itemIds ?? [],
          evaluationType,
          judgeModelId,
          language,
        });
      } catch (e: unknown) {
        // Checked before it leaves the page: a subset without ids would ask for the whole set.
        toast.error(e instanceof RunRequestError ? e.message : t('evaluationDetail.toastRunFailed'));
        return;
      }
      setDialogOpen(false);
      setRunning(true);
      setStartedAt(Date.now());
      setElapsed(0);
      try {
        const queued = await runEvaluation(evaluationId, body);
        onQueued(queued.run_id);
        toast.success(t('evaluationDetail.toastRunQueued', { runId: `${queued.run_id.slice(0, 8)}…` }));
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t('evaluationDetail.toastRunFailed'));
        setRunning(false);
        setStartedAt(null);
      }
    },
    [evaluationId, evaluationType, onQueued, t],
  );

  return useMemo(
    () => ({
      runs,
      runsLoading,
      loadRuns,
      running,
      elapsed,
      dialogOpen,
      openDialog,
      closeDialog,
      submit,
    }),
    [runs, runsLoading, loadRuns, running, elapsed, dialogOpen, submit],
  );
}
