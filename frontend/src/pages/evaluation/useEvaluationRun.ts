import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  getEvaluationRun,
  listEvaluationRuns,
  runEvaluation,
  type EvaluationRunListItem,
  type EvaluationRunResponse,
} from '../../data/evaluationsApi';
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
  runFromUrl,
  setRunInUrl,
  onFinished,
}: {
  evaluationId: string | undefined;
  /** The run type last chosen; the dialog does not change it, the toolbar does. */
  evaluationType: string;
  /** `?run=<id>` — the run this URL points at, so a link can be shared. */
  runFromUrl: string | null;
  setRunInUrl: (runId: string | null) => void;
  /** Called when a run finishes (reload items, counts, the report). */
  onFinished: () => void;
}) {
  const { t } = useTranslation('workspace');
  const [runs, setRuns] = useState<EvaluationRunListItem[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runView, setRunView] = useState<EvaluationRunResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  /** The run this page is waiting on; polling stops when the worker closes it. */
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
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

  // A run in the URL is the one to show (a shared link, or the one just queued).
  useEffect(() => {
    if (!evaluationId || !runFromUrl || runView?.run_id === runFromUrl) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await getEvaluationRun(evaluationId, runFromUrl);
        if (!cancelled) setRunView(res);
      } catch {
        if (!cancelled) {
          toast.error(t('evaluationDetail.toastLoadRunFailed'));
          setRunInUrl(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [evaluationId, runFromUrl, runView?.run_id, setRunInUrl, t]);

  useEffect(() => {
    if (!running || !startedAt) return;
    const id = window.setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [running, startedAt]);

  // Follow the queued run until the worker closes it: the run row is what this page shows, so it is what gets polled.
  useEffect(() => {
    if (!activeRunId || !evaluationId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await getEvaluationRun(evaluationId, activeRunId);
        if (cancelled) return;
        setRunView(res);
        if (res.status === 'running') return;
        setActiveRunId(null);
        setRunning(false);
        setStartedAt(null);
        void loadRuns();
        onFinished();
        if (res.status === 'completed') {
          toast.success(
            t('evaluationDetail.toastRunSuccess', {
              runId: `${res.run_id.slice(0, 8)}…`,
              pass: res.pass_count,
              total: res.item_count,
            }),
          );
        } else {
          toast.error(res.error_message || t('evaluationDetail.toastRunFailed'));
        }
      } catch {
        /* keep polling: a transient read failure should not abandon a run that is still going */
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [activeRunId, evaluationId, loadRuns, onFinished, t]);

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
      setRunView(null);
      try {
        const queued = await runEvaluation(evaluationId, body);
        setRunView(queued);
        setRunInUrl(queued.run_id);
        setActiveRunId(queued.run_id);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t('evaluationDetail.toastRunFailed'));
        setRunning(false);
        setStartedAt(null);
      }
    },
    [evaluationId, evaluationType, setRunInUrl, t],
  );

  return useMemo(
    () => ({
      runs,
      runsLoading,
      loadRuns,
      runView,
      running,
      elapsed,
      dialogOpen,
      openDialog,
      closeDialog,
      submit,
      showRun: setRunView,
    }),
    [runs, runsLoading, loadRuns, runView, running, elapsed, dialogOpen, submit],
  );
}
