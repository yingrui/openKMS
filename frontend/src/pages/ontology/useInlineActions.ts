import { useMemo } from 'react';
import type { ActionApplicability } from '../../data/ontologyActionsApi';

/**
 * Which property an action edits in place, keyed by property — a column has at most one such action.
 *
 * The table asks this map for every cell, so it is derived once per action list rather than per row.
 */
export function useInlineActions(
  actions: ActionApplicability[]
): Record<string, ActionApplicability> {
  return useMemo(() => {
    const out: Record<string, ActionApplicability> = {};
    for (const action of actions) {
      const prop = action.inline_edit?.prop;
      if (prop) out[prop] = action;
    }
    return out;
  }, [actions]);
}

/** The one-field input an inline edit sends: the parameter the action declared, and the cell's new value. */
export function inlineInput(
  action: ActionApplicability,
  value: unknown
): Record<string, unknown> {
  const param = action.inline_edit?.param ?? action.inline_edit?.prop ?? '';
  return { [param]: value };
}
