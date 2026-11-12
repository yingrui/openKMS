import { createContext, useContext } from 'react';
import type { EvaluationResponse } from '../../data/evaluationsApi';

/**
 * The one thing every tab of an evaluation needs: the dataset itself.
 *
 * The shell loads it once and hands it down; a tab that loaded its own copy would disagree with the header the moment one
 * of them refreshed — which is how a page ends up saying "17 items" while the table shows 16.
 */
export interface EvaluationDetailContext {
  evaluationId: string;
  dataset: EvaluationResponse;
  itemTotal: number;
  reload: () => void;
}

export const EvaluationDetailCtx = createContext<EvaluationDetailContext | null>(null);

export function useEvaluationDetail(): EvaluationDetailContext {
  const ctx = useContext(EvaluationDetailCtx);
  if (!ctx) throw new Error('useEvaluationDetail must be used inside EvaluationDetailCtx');
  return ctx;
}

/** Which run type a dataset's items support — mirrors `KIND_RUN_TYPES` on the backend. */
export const RUN_TYPES_BY_KIND: Record<string, string[]> = {
  answer: ['search_retrieval', 'qa_answer'],
  query: ['data_query'],
  content: ['wiki_content_coverage'],
};

export const isQueryKind = (kind: string | undefined) => (kind ?? 'answer') === 'query';
