import type { EvaluationRunRequestBody } from '../../data/evaluationsApi';

/**
 * The body `POST /api/evaluations/{id}/run` accepts, built once so it can be checked before it leaves the page.
 *
 * The failure this prevents is silent: a dialog that means "just the seven that failed" but sends no ids asks the server
 * for **all** items, and nobody notices until the run comes back with seventeen results. So the shape is asserted here —
 * `item_scope: "subset"` without ids throws instead of degrading into "everything" — and the API agrees: it answers 400
 * for the same combination.
 */
export type RunRequestBody = {
  evaluation_type: string;
  item_scope: 'all' | 'subset';
  item_ids: string[] | null;
  judge_model_id: string | null;
  language: 'en' | 'zh';
};

export type RunRequestInput = {
  scope: 'all' | 'failed';
  /** Failed item ids of the run the reader picked. */
  failedItemIds: string[];
  evaluationType: string;
  judgeModelId: string | null;
  language: 'en' | 'zh';
};

export class RunRequestError extends Error {}

export function buildRunRequest(input: RunRequestInput): RunRequestBody {
  const ids = input.scope === 'failed' ? input.failedItemIds : null;
  if (input.scope === 'failed') {
    if (!ids || ids.length === 0) {
      throw new RunRequestError('Nothing to run: the chosen run has no failed items.');
    }
    if (ids.some((id) => typeof id !== 'string' || id.trim() === '')) {
      throw new RunRequestError('Nothing to run: the item list contains an empty id.');
    }
  }
  if (!input.evaluationType) {
    throw new RunRequestError('Nothing to run: the evaluation type is missing.');
  }
  return {
    evaluation_type: input.evaluationType,
    item_scope: ids === null ? 'all' : 'subset',
    item_ids: ids,
    judge_model_id: input.judgeModelId,
    language: input.language,
  };
}

/** The keys the API's request model accepts — asserted in tests so a rename on either side is caught here. */
export const RUN_REQUEST_KEYS = [
  'evaluation_type',
  'item_scope',
  'item_ids',
  'judge_model_id',
  'language',
] as const satisfies readonly (keyof EvaluationRunRequestBody)[];
