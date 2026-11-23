import { useState } from 'react';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import { searchKnowledgeBase, type SearchResult } from '../../../../data/knowledgeBasesApi';
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
/** The ceiling one "show more" may reach: the same 100 the selector offers. */
export const SHOW_MORE_MAX = 100;

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

  const runSearch = async (limit: number) => {
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
        top_k: limit,
        search_type: searchType,
        force_dense: searchForceDense || undefined,
        metadata_filters: Object.keys(metadata_filters).length ? metadata_filters : undefined,
      });
      setSearchResults(res.results);
      setHasSearched(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastSearchFailed'));
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await runSearch(searchTopK);
  };

  /**
   * The next page is the same query with a larger cut — not a page of a stable list.
   *
   * Retrieval ranks candidates; there is no second slice waiting behind the first, only lower-ranked hits. Asking for
   * ten more re-runs the query at `top_k + 10`, which is exactly "show top 20". The order can shift slightly, because a
   * wider candidate pool re-ranks; the label says "show more", not "next page", for that reason.
   */
  const showMore = async () => {
    const next = Math.min(searchTopK + 10, SHOW_MORE_MAX);
    setSearchTopK(next);
    await runSearch(next);
  };

  return {
    showMore,
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
    handleSearch,
  };
}
