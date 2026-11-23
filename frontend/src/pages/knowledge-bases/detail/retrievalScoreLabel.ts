import type { SearchResult } from '../../../data/knowledgeBasesApi';

/**
 * How a hit's number may be labelled.
 *
 * `score` is rewritten at each stage, so the same field means three things: after rerank it is the reranker's relevance
 * (0–1); dense-only it is cosine similarity; after RRF it is `Σ 1/(60+rank+1)`, about 0.03 whatever the answer quality —
 * shown as a percentage that reads as "3% match", which is how someone concluded retrieval was broken.
 */
export function retrievalScoreLabel(
  s: SearchResult,
  t: (key: string, options?: Record<string, unknown>) => string
): string | null {
  const debug = s.retrieval_debug || {};
  const stages = Array.isArray(debug.pipeline_stages) ? debug.pipeline_stages : [];
  const rerankScore = debug.rerank_score;
  if (stages.includes('rerank') && typeof rerankScore === 'number' && Number.isFinite(rerankScore)) {
    return t('detail.retrieval.scoreRelevance', { pct: Math.round(rerankScore * 100) });
  }
  if (stages.length === 1 && stages[0] === 'dense' && s.score > 0) {
    return t('detail.retrieval.scoreSimilarity', { value: s.score.toFixed(2) });
  }
  // A fused rank: the panel lists the per-recall ranks, and a percentage here would be a fiction.
  return null;
}
