import type { Dispatch, SetStateAction } from 'react';
import type { ObjectInstanceResponse } from '../../data/ontologyApi';

/**
 * Row selection for the results table: one row, or the page.
 *
 * "All" means the rows on screen — the table shows a page — and ticking it twice clears them, because a control that
 * only ever adds is a control the reader has to undo by hand.
 */
export function useRowSelection(
  instances: ObjectInstanceResponse[],
  setSelected: Dispatch<SetStateAction<Set<string>>>
) {
  const toggleRow = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllRows = () =>
    setSelected((current) => {
      const all = instances.every((row) => current.has(row.id));
      const next = new Set(current);
      for (const row of instances) {
        if (all) next.delete(row.id);
        else next.add(row.id);
      }
      return next;
    });

  return { toggleRow, toggleAllRows };
}

/** The ticked rows themselves, which is what an action's parameter prefill needs. */
export function selectedRows(instances: ObjectInstanceResponse[], selected: Set<string>) {
  return instances.filter((row) => selected.has(row.id));
}
