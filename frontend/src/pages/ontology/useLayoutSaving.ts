import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  fetchExplorationLayout,
  saveExplorationLayout,
  type ExplorationLayoutChoice,
} from '../../data/explorationsApi';

/**
 * Saving the layout: "this is how this type should open", for me or for everyone.
 *
 * It is separate from saving an exploration because it answers a different question — an exploration is a named view
 * with conditions, a layout is the shape a type opens with when nothing names one. They share only the object.
 */
export function useLayoutSaving({
  typeId,
  buildLayout,
  onChoices,
  onReset,
}: {
  typeId: string;
  buildLayout: () => Record<string, unknown>;
  onChoices: (choices: ExplorationLayoutChoice[]) => void;
  /** Clearing the layout also clears the charts on screen back to the type's built-in ones. */
  onReset: () => void;
}) {
  const { t } = useTranslation('explore');
  const [saving, setSaving] = useState(false);

  const saveAsMine = useCallback(
    async (scope: 'personal' | 'global' = 'personal') => {
      if (!typeId) return;
      setSaving(true);
      try {
        await saveExplorationLayout(typeId, buildLayout(), scope);
        const refreshed = await fetchExplorationLayout(typeId);
        onChoices(refreshed.available ?? []);
        toast.success(
          scope === 'global' ? t('objectSet.layoutSavedGlobal') : t('objectSet.layoutSaved')
        );
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t('objectSet.layoutFailed'));
      } finally {
        setSaving(false);
      }
    },
    [buildLayout, onChoices, t, typeId]
  );

  const reset = useCallback(async () => {
    if (!typeId) return;
    setSaving(true);
    try {
      await saveExplorationLayout(typeId, {}, 'personal');
      onReset();
      toast.success(t('objectSet.layoutReset'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('objectSet.layoutFailed'));
    } finally {
      setSaving(false);
    }
  }, [onReset, t, typeId]);

  return { saving, saveAsMine, reset };
}
