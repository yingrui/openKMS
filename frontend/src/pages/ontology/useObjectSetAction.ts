import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  executeOntologyActionBatch,
  type OntologyActionTypeResponse,
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
  const [openAction, setOpenAction] = useState<OntologyActionTypeResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (objectIds: string[], input: Record<string, unknown>) => {
    if (!openAction || objectIds.length === 0) return;
    setBusy(true);
    try {
      const result = await executeOntologyActionBatch(openAction.id, {
        object_ids: objectIds,
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

  return { openAction, setOpenAction, busy, run };
}
