import type { SearchResult } from '../../data/knowledgeBasesApi';
import type { KbSearchRetrievalDiff, KbSearchSnapshot } from './KnowledgeBaseDetail.types';

export function kbSnapshotFromResults(
  query: string,
  searchType: string,
  topK: number,
  forceDense: boolean,
  results: SearchResult[]
): KbSearchSnapshot {
  const orderedIds = results.map((r) => r.id);
  const scores: Record<string, number> = {};
  for (const r of results) scores[r.id] = r.score;
  return { query, searchType, topK, forceDense, orderedIds, scores };
}

export function kbComputeSearchDiff(prev: KbSearchSnapshot, cur: KbSearchSnapshot): KbSearchRetrievalDiff {
  const prevSet = new Set(prev.orderedIds);
  const curSet = new Set(cur.orderedIds);
  const added = cur.orderedIds.filter((id) => !prevSet.has(id));
  const removed = prev.orderedIds.filter((id) => !curSet.has(id));
  const moved: { id: string; from: number; to: number }[] = [];
  cur.orderedIds.forEach((id, to) => {
    const from = prev.orderedIds.indexOf(id);
    if (from >= 0 && from !== to) moved.push({ id, from, to });
  });
  return { added, removed, moved };
}

export function kbHasRetrievalProvenance(s: SearchResult): boolean {
  if (s.chunk_index != null && s.chunk_index !== undefined) return true;
  if (s.retrieval_mode) return true;
  const d = s.retrieval_debug;
  if (d && typeof d === 'object' && Object.keys(d).length > 0) return true;
  return false;
}
