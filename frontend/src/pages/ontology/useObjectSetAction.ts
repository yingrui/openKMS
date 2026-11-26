import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  executeOntologyAction,
  executeOntologyActionBatch,
  type ActionApplicability,
} from '../../data/ontologyActionsApi';

/**
 * Running an action over the objects the exploration selected.
 *
 * The selection is the input, so this hook owns only the in-flight state: which action is open, whether it is
 * running, and the report at the end. A batch is not a transaction — the answer says how many were refused, and the
 * rows are re-read rather than patched locally, because the action may have changed what they sort by.
 */
export function useObjectSetAction(
  onFinished: (outcome: { name: string; succeeded: number }) => void
) {
  const { t } = useTranslation('explore');
  const [openAction, setOpenAction] = useState<ActionApplicability | null>(null);
  /** Whether the action runs over the ticked rows or over the set the exploration is showing. */
  const [scope, setScope] = useState<'selection' | 'set' | 'single'>('selection');
  const [busy, setBusy] = useState(false);

  const run = async (
    target: { ids?: string[]; conditions?: string[]; single?: boolean },
    input: Record<string, unknown>
  ) => {
    if (!openAction) return;
    if (!target.single && !target.conditions && (target.ids ?? []).length === 0) return;
    if (target.single) {
      /* An action that runs once is one call, not a batch of one. */
      setBusy(true);
      try {
        const result = await executeOntologyAction(openAction.id, { input });
        const ok = result.status === 'ok';
        const message = ok
          ? t('objectSet.actionSingleDone')
          : result.error || t('objectSet.actionFailed');
        if (ok) toast.success(message);
        else toast.error(message);
        setOpenAction(null);
        onFinished({ name: openAction.display_name, succeeded: ok ? 1 : 0 });
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t('objectSet.actionFailed'));
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      const result = await executeOntologyActionBatch(openAction.id, {
        object_ids: target.ids ?? [],
        apply_to_set: Boolean(target.conditions),
        conditions: target.conditions ?? [],
        input,
      });
      const message = t('objectSet.actionDone', {
        succeeded: result.succeeded,
        failed: result.failed,
      });
      if (result.failed > 0) toast.warning(message);
      else toast.success(message);
      const name = openAction.display_name;
      setOpenAction(null);
      onFinished({ name, succeeded: result.succeeded });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('objectSet.actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const openFor = (action: ActionApplicability, next: 'selection' | 'set' | 'single') => {
    setScope(next);
    setOpenAction(action);
  };

  return { openAction, openFor, scope, setOpenAction, busy, run };
}

/** How many objects the dialog will act on — one for an action that runs once, the set for "run on all". */
export function actionCount(
  scope: 'selection' | 'set' | 'single',
  action: ActionApplicability | null,
  selected: number
): number {
  if (scope === 'set') return action?.eligible ?? 0;
  return scope === 'single' ? 1 : selected;
}
