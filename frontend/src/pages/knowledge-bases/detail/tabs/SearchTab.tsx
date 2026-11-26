import { Link } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { ChevronDown, ChevronRight, Filter, Search as SearchIcon, Send } from 'lucide-react';
import type { SearchResult } from '../../../../data/knowledgeBasesApi';
import { CheckRow, EmptyState, FormField } from '../../../../styles/design-system';
import { EntityViewHeader, EntityViewPanel } from '../../../shared/EntityViewShell';
import { RetrievalProvenancePanel } from '../RetrievalProvenancePanel';
import './SearchTab.scss';

export type KbSearchType = 'all' | 'chunks' | 'faqs';

/**
 * Ask the corpus directly: the search the agent's retriever calls, exposed without an answer on top.
 *
 * The shape is the app's: one panel for the query (type strip, the box, and the ranking/metadata knobs folded
 * away until asked for) and one for the hits, each rendered with the shared field and empty-state primitives.
 */
export function SearchTab({
  t,
  query,
  onQueryChange,
  searchType,
  onSearchTypeChange,
  onSubmit,
  searching,
  results,
  hasSearched,
  optionsOpen,
  onToggleOptions,
  activeFilterCount,
  topK,
  onTopKChange,
  onShowMore,
  forceDense,
  onForceDenseChange,
  metadataKeys,
  metadataFilters,
  onMetadataFilterChange,
  onChunkView,
  onChunkEdit,
}: {
  t: TFunction;
  query: string;
  onQueryChange: (value: string) => void;
  searchType: KbSearchType;
  onSearchTypeChange: (type: KbSearchType) => void;
  onSubmit: (e: React.FormEvent) => void;
  searching: boolean;
  results: SearchResult[];
  hasSearched: boolean;
  optionsOpen: boolean;
  onToggleOptions: () => void;
  activeFilterCount: number;
  topK: number;
  onTopKChange: (value: number) => void;
  /** Re-run the same query with a larger cut — the "next page" of a ranked list. */
  onShowMore: () => void;
  forceDense: boolean;
  onForceDenseChange: (value: boolean) => void;
  metadataKeys: string[] | null | undefined;
  metadataFilters: Record<string, string>;
  onMetadataFilterChange: (key: string, value: string) => void;
  onChunkView: (chunkId: string) => void;
  onChunkEdit: (chunkId: string) => void;
}) {
  const searchTypeLabel = (type: KbSearchType) =>
    type === 'all'
      ? t('detail.searchTypeAll')
      : type === 'chunks'
        ? t('detail.searchTypeChunks')
        : t('detail.searchTypeFaqs');

  return (
    <>
      <EntityViewHeader title={t('detail.searchTitle')} hint={t('detail.searchDesc')} />

      <EntityViewPanel>
        <div className="kb-search-query">
          <div className="kb-search-types" role="group" aria-label={t('detail.searchTypeAria')}>
            {(['all', 'chunks', 'faqs'] as const).map((type) => (
              <button
                key={type}
                type="button"
                className={`kb-search-type${searchType === type ? ' is-active' : ''}`}
                onClick={() => onSearchTypeChange(type)}
                aria-pressed={searchType === type}
              >
                {searchTypeLabel(type)}
              </button>
            ))}
          </div>

          <form className="kb-search-form" onSubmit={onSubmit}>
            <input
              type="search"
              className="ds-control"
              aria-label={t('detail.searchAria')}
              placeholder={t('detail.searchPlaceholder')}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
            />
            <label className="kb-search-limit">
              {t('detail.searchLimitLabel')}
              <select
                className="ds-control"
                value={topK}
                onChange={(e) => onTopKChange(Number(e.target.value))}
              >
                {/* The current cut is always listed: "show more" lands on 20, which is not one of the presets. */}
                {[...new Set([10, 25, 50, 100, topK])]
                  .sort((a, b) => a - b)
                  .map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
              </select>
            </label>
            <button type="submit" className="btn btn-primary" disabled={searching}>
              <Send size={16} aria-hidden />
              <span className="ds-compact-label">
                {searching ? t('detail.searching') : t('detail.search')}
              </span>
            </button>
          </form>

          <button
            type="button"
            className="kb-search-options-toggle"
            onClick={onToggleOptions}
            aria-expanded={optionsOpen}
          >
            {optionsOpen ? (
              <ChevronDown size={16} aria-hidden />
            ) : (
              <ChevronRight size={16} aria-hidden />
            )}
            <Filter size={16} aria-hidden />
            <span>{t('detail.searchOptionsToggle')}</span>
            {activeFilterCount > 0 ? (
              <span className="kb-search-options-badge">
                {t('detail.filtersActive')}
              </span>
            ) : null}
          </button>

          {optionsOpen ? (
            <>
              <CheckRow
                checked={forceDense}
                onChange={onForceDenseChange}
                title={t('detail.searchForceDense')}
              />

              {metadataKeys?.length ? (
                <>
                  <p className="ds-field__hint">{t('detail.filtersHint')}</p>
                  {metadataKeys.map((key) => (
                    <FormField key={key} label={key}>
                      <input
                        type="text"
                        placeholder={t('detail.placeholderMetaExample')}
                        value={metadataFilters[key] ?? ''}
                        onChange={(e) => onMetadataFilterChange(key, e.target.value)}
                      />
                    </FormField>
                  ))}
                </>
              ) : (
                <p className="ds-field__hint">{t('detail.metadataKeysEmptyHint')}</p>
              )}
            </>
          ) : null}
        </div>
      </EntityViewPanel>

      {hasSearched ? (
        <EntityViewPanel>
          {results.length === 0 ? (
            <EmptyState
              icon={<SearchIcon size={40} strokeWidth={1} aria-hidden />}
              description={t('detail.noSearchResults')}
            />
          ) : (
            <div className="kb-search-results-wrap">
              <div className="kb-search-results-head">
                {/* "Results (10)" read like a page that might have siblings. Retrieval returns a ranked top K; there is
                    no page two, because the eleventh hit is never withheld — it is simply less relevant. */}
                <h3>{t('detail.resultsTitle', { count: results.length })}</h3>
              </div>

              <ul className="kb-search-results">
                {results.map((r, i) => (
                  <li key={r.id} className="kb-search-hit">
                    {/* Content on the left, the retrieval trace beside it: stacked, the trace left two thirds of the
                        card empty and pushed each hit to three screen-heights. */}
                    <div className="kb-search-hit-main">
                    <div className="kb-search-hit-head">
                      <span className="kb-search-hit-source">
                        [{r.source_type}]
                        {r.source_type === 'chunk' && r.wiki_page_id && r.wiki_space_id ? (
                          <span className="kb-search-hit-kind">{t('detail.searchHitWiki')}</span>
                        ) : null}{' '}
                        {r.wiki_page_id && r.wiki_space_id ? (
                          <Link to={`/wikis/${r.wiki_space_id}/pages/${r.wiki_page_id}`}>
                            {r.source_name || r.wiki_page_id}
                          </Link>
                        ) : r.document_id ? (
                          <Link to={`/documents/view/${r.document_id}`}>
                            {r.source_name || r.document_id}
                          </Link>
                        ) : (
                          <span>{r.source_name || r.document_id || t('detail.faqSourceFallback')}</span>
                        )}
                      </span>
                    </div>
                    <p className="kb-search-hit-excerpt">
                      {r.content.length > 300 ? `${r.content.slice(0, 300).trimEnd()}…` : r.content}
                    </p>
                    {r.source_type === 'chunk' ? (
                      <div className="openkms-flex-row-gap kb-search-hit-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => onChunkView(r.id)}
                        >
                          {t('detail.chunkView')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => onChunkEdit(r.id)}
                        >
                          {t('detail.chunkEdit')}
                        </button>
                      </div>
                    ) : null}
                    </div>
                    <RetrievalProvenancePanel s={r} rank={i + 1} />
                  </li>
                ))}
              </ul>
              {results.length >= topK && topK < 100 ? (
                <div className="kb-search-more">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={searching}
                    onClick={onShowMore}
                  >
                    {t('detail.searchShowMore', { count: 10 })}
                  </button>
                  <span className="ds-field__hint">{t('detail.searchShowMoreHint', { count: topK + 10 })}</span>
                </div>
              ) : null}
            </div>
          )}
        </EntityViewPanel>
      ) : (
        <EntityViewPanel>
          <EmptyState
            icon={<SearchIcon size={40} strokeWidth={1} aria-hidden />}
            description={t('detail.searchEmptyPrompt')}
          />
        </EntityViewPanel>
      )}
    </>
  );
}
