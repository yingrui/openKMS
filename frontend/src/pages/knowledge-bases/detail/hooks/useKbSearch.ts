import { useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import { searchKnowledgeBase, type SearchResult } from '../../../../data/knowledgeBasesApi';
import { kbComputeSearchDiff, kbSnapshotFromResults } from '../../KnowledgeBaseDetail.searchUtils';
import type { KbSearchRetrievalDiff, KbSearchSnapshot } from '../../KnowledgeBaseDetail.types';
import type { KbSearchType } from '../tabs/SearchTab';

/** A filter value: one term, or a list when the reader separates terms with commas. */
function parseFilterValue(value: string): string | string[] {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return trimmed;
}

/**
 * The search tab's own state: the query, its options, the hits, and how the result set moved since the
 * previous run.
 *
 * The diff is kept here rather than derived in the view because it is a comparison against *last time* —
 * a question the view cannot answer without holding the previous snapshot, and one worth asking: an answer
 * that changed because the ranking changed is a different problem from one that changed because the model
 * changed.
 */
export function useKbSearch({ kbId, t }: { kbId: string | undefined; t: TFunction }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<KbSearchType>('all');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchOptionsExpanded, setSearchOptionsExpanded] = useState(false);
  const [searchLabelFilters] = useState<Record<string, string>>({});
  const [searchMetadataFilters, setSearchMetadataFilters] = useState<Record<string, string>>({});
  const [searchTopK, setSearchTopK] = useState(10);
  const [searchForceDense, setSearchForceDense] = useState(false);
  const searchPrevSnapshotRef = useRef<KbSearchSnapshot | null>(null);
  const [searchRetrievalDiff, setSearchRetrievalDiff] = useState<KbSearchRetrievalDiff | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kbId || !searchQuery.trim()) return;
    setSearching(true);
    try {
      const metadata_filters: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(searchMetadataFilters)) {
        const parsed = parseFilterValue(v);
        if (parsed && (typeof parsed === 'string' ? parsed : parsed.length > 0)) {
          metadata_filters[k] = parsed;
        }
      }
      const res = await searchKnowledgeBase(kbId, {
        query: searchQuery,
        top_k: searchTopK,
        search_type: searchType,
        force_dense: searchForceDense || undefined,
        metadata_filters: Object.keys(metadata_filters).length ? metadata_filters : undefined,
      });
      const snapshot = kbSnapshotFromResults(
        searchQuery,
        searchType,
        searchTopK,
        searchForceDense,
        res.results
      );
      const previous = searchPrevSnapshotRef.current;
      setSearchRetrievalDiff(previous ? kbComputeSearchDiff(previous, snapshot) : null);
      searchPrevSnapshotRef.current = snapshot;
      setSearchResults(res.results);
      setHasSearched(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastSearchFailed'));
    } finally {
      setSearching(false);
    }
  };

  return {
    searchQuery,
    setSearchQuery,
    searchType,
    setSearchType,
    searchResults,
    searching,
    hasSearched,
    searchOptionsExpanded,
    setSearchOptionsExpanded,
    searchLabelFilters,
    searchMetadataFilters,
    setSearchMetadataFilters,
    searchTopK,
    setSearchTopK,
    searchForceDense,
    setSearchForceDense,
    searchRetrievalDiff,
    handleSearch,
  };
}
