import { createContext, useContext } from 'react';
import type { useKnowledgeBaseDetail } from './useKnowledgeBaseDetail';

/**
 * One knowledge base's detail state, shared by the shell and the section routes it renders.
 *
 * The shell owns the data (the base, its counts, every dialog) and each section renders one tab from
 * it — the same shape the dataset and semantic-model detail pages use, so a section never threads
 * twenty props through its parent.
 */
export type KnowledgeBaseDetailContext = ReturnType<typeof useKnowledgeBaseDetail>;

export const KnowledgeBaseDetailCtx = createContext<KnowledgeBaseDetailContext | null>(null);

export function useKbDetail(): KnowledgeBaseDetailContext {
  const ctx = useContext(KnowledgeBaseDetailCtx);
  if (!ctx) {
    throw new Error('useKbDetail must be used inside KnowledgeBaseDetailCtx.Provider');
  }
  return ctx;
}
