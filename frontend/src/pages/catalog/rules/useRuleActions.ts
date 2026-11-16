/**
 * A rule's side effects: run, trial, delete, and moving an event.
 *
 * Split out of the page (which was over the 700-line guard) — these all share one shape: call the API,
 * toast the outcome, reload. They know nothing about how a rule is edited, so they belong next to the
 * page, not inside it.
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useConfirm } from '../../../contexts/ConfirmContext';
import {
  deleteRule,
  evaluateRule,
  type RuleOut,
  type RulesEvaluateResponse,
} from '../../../data/rulesApi';
import { transitionEvent, type EventOut } from '../../../data/eventsApi';
import type { RunParams } from './RunRulesDialog';

export function useRuleActions({
  rule,
  load,
  runOpen,
  setRunOpen,
  setTrial,
  running,
  setRunning,
  eventCount,
  setBusyEventId,
}: {
  rule: RuleOut | null;
  load: () => Promise<void>;
  runOpen: boolean;
  setRunOpen: (open: boolean) => void;
  setTrial: (trial: RulesEvaluateResponse | null) => void;
  running: boolean;
  setRunning: (running: boolean) => void;
  eventCount: number;
  setBusyEventId: (id: string | null) => void;
}) {
  const { t } = useTranslation('ontology');
  const navigate = useNavigate();
  const confirm = useConfirm();

  const run = useCallback(
    async (params: RunParams) => {
      if (!rule) return;
      setRunning(true);
      try {
        const result = await evaluateRule(rule.id, params);
        const first = result.results[0];
        toast.success(
          result.results.length > 1
            ? t('rules.toastRanAll', { count: result.results.length, failed: result.failed })
            : t(`rules.status.${first?.status ?? 'pass'}`),
        );
        await load();
        setRunOpen(false);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t('rules.toastRunFailed'));
      } finally {
        setRunning(false);
      }
    },
    [rule, load, setRunOpen, setRunning, t],
  );

  const trialRun = useCallback(
    async (params: RunParams) => {
      if (!rule) return;
      setRunning(true);
      try {
        setTrial(await evaluateRule(rule.id, { ...params, dry_run: true }));
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t('rules.toastRunFailed'));
      } finally {
        setRunning(false);
      }
    },
    [rule, setRunning, setTrial, t],
  );

  const remove = useCallback(async () => {
    if (!rule) return;
    const ok = await confirm({
      title: t('rules.deleteTitle'),
      message: t('rules.deleteConfirm', { count: eventCount }),
      confirmLabel: t('shared.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteRule(rule.id);
      toast.success(t('rules.toastDeleted'));
      navigate('/data-rules');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('rules.toastSaveFailed'));
    }
  }, [rule, confirm, eventCount, navigate, t]);

  const moveEvent = useCallback(
    async (event: EventOut, status: 'resolved' | 'dismissed') => {
      setBusyEventId(event.id);
      try {
        await transitionEvent(event.id, { status });
        await load();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t('rules.toastEventFailed'));
      } finally {
        setBusyEventId(null);
      }
    },
    [load, setBusyEventId, t],
  );

  return { run, trialRun, remove, moveEvent, runOpen, running };
}
