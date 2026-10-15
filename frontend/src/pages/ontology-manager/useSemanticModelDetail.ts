import { createContext, useContext } from 'react';
import type { DatasetResponse } from '../../data/datasetsApi';
import type { SemanticModelResponse } from '../../data/semanticModelsApi';

export type SemanticModelDetailContext = {
  model: SemanticModelResponse;
  /** Every dataset in the instance — the model's scope is picked from these. */
  allDatasets: DatasetResponse[];
  reload: () => Promise<void>;
};

export const SemanticModelDetailCtx = createContext<SemanticModelDetailContext | null>(null);

export function useSemanticModelDetail(): SemanticModelDetailContext {
  const ctx = useContext(SemanticModelDetailCtx);
  if (!ctx) throw new Error('useSemanticModelDetail requires SemanticModelDetailPage');
  return ctx;
}
