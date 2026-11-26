import type { ActionApplicability } from '../../data/ontologyActionsApi';
import type { LinkTypeResponse, ObjectTypeResponse } from '../../data/ontologyApi';
import { useInlineActions } from './useInlineActions';
import { useLinkedColumnLabels } from './useLinkedColumnLabels';

/**
 * What the results table needs beyond the rows: which cells an action edits, and what an id column points at.
 *
 * Both are answers to "what can happen in this table", and both are derived from the same two inputs (the applicable
 * actions, the ontology's links), so they are derived together rather than in the page body.
 */
export function useTableActions({
  actions,
  typeId,
  links,
  typeById,
  columns,
  rows,
}: {
  actions: ActionApplicability[];
  typeId: string;
  links: LinkTypeResponse[];
  typeById: Record<string, ObjectTypeResponse>;
  columns: string[];
  rows: { data?: Record<string, unknown> | null }[];
}) {
  const inlineActions = useInlineActions(actions);
  const columnLabels = useLinkedColumnLabels({ typeId, links, typeById, columns, rows });
  return { inlineActions, columnLabels };
}
