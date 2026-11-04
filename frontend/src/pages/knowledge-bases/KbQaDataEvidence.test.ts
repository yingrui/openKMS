import { describe, expect, it } from 'vitest';
import type { SearchResult } from '../../data/knowledgeBasesApi';
import { isDataEvidenceSource, splitQaSources } from './KnowledgeBaseDetail.qaUtils';

function src(partial: Partial<SearchResult> & Pick<SearchResult, 'id' | 'source_type'>): SearchResult {
  return {
    content: '',
    score: 1,
    ...partial,
  };
}

describe('splitQaSources', () => {
  it('puts metric and semantic_model into evidence', () => {
    const { evidence, references } = splitQaSources([
      src({ id: '1', source_type: 'metric', source_name: 'GMV' }),
      src({ id: '2', source_type: 'chunk', source_name: 'doc' }),
      src({ id: '3', source_type: 'semantic_model', source_name: 'SQL Lab' }),
      src({ id: '4', source_type: 'ontology', source_name: 'types' }),
    ]);
    expect(evidence.map((s) => s.id)).toEqual(['1', '3']);
    expect(references.map((s) => s.id)).toEqual(['2', '4']);
  });

  it('detects data evidence kinds', () => {
    expect(isDataEvidenceSource(src({ id: 'a', source_type: 'metric' }))).toBe(true);
    expect(isDataEvidenceSource(src({ id: 'b', source_type: 'faq' }))).toBe(false);
  });
});
