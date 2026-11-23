import { describe, expect, it } from 'vitest';
import type { SearchResult } from '../../../data/knowledgeBasesApi';
import { retrievalScoreLabel } from './retrievalScoreLabel';

const t = (key: string, opts?: Record<string, unknown>) =>
  `${key}:${JSON.stringify(opts ?? {})}`;

function src(over: Partial<SearchResult>): SearchResult {
  return { id: 'x', source_type: 'chunk', content: 'c', score: 0, ...over } as SearchResult;
}

describe('a hit’s number is labelled by what it is', () => {
  it('a reranked hit reports the reranker’s relevance', () => {
    const label = retrievalScoreLabel(
      src({ score: 0.87, retrieval_debug: { pipeline_stages: ['dense', 'bm25', 'rrf', 'rerank'], rerank_score: 0.87 } }),
      t
    );
    expect(label).toContain('scoreRelevance');
    expect(label).toContain('87');
  });

  it('a fused hit shows no percentage at all', () => {
    // 0.0302 is the RRF sum; as "3% match" it reads as terrible retrieval, which is the bug this closes.
    const label = retrievalScoreLabel(
      src({ score: 0.030159, retrieval_debug: { pipeline_stages: ['dense', 'bm25', 'rrf'] } }),
      t
    );
    expect(label).toBeNull();
  });

  it('a dense-only hit reports similarity as a decimal', () => {
    const label = retrievalScoreLabel(
      src({ score: 0.5551, retrieval_debug: { pipeline_stages: ['dense'] } }),
      t
    );
    expect(label).toContain('scoreSimilarity');
    expect(label).toContain('0.56');
  });
});
