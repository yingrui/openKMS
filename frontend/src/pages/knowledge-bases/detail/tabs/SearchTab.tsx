import { Link } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { ChevronDown, ChevronRight, Filter, Search as SearchIcon, Send } from 'lucide-react';
import type { SearchResult } from '../../../../data/knowledgeBasesApi';
import type { KbSearchRetrievalDiff } from '../../KnowledgeBaseDetail.types';
import { ChatRetrievalProvenancePanel } from '../../../workforce/chat';
import { EntityViewHeader, EntityViewPanel } from '../../../shared/EntityViewShell';
import './SearchTab.scss';

export type KbSearchType = 'all' | 'chunks' | 'faqs';

/**
 * Ask the corpus directly: the search the agent's retriever calls, exposed without an answer on top.
 *
 * Two things this tab exists for. It says **what the retriever returned** — score, retrieval mode, the
 * hybrid-stage detail behind each hit — and, on a rerun, **how the result set moved** since last time
 * (`searchRetrievalDiff`): an answer that changed because the ranking changed is a different problem from
 * one that changed because the model changed.
 *
 * The options panel keeps its advanced knobs folded away: top-k and dense-only change what the reader is
 * looking at, and are not what someone typing a question came for.
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
  forceDense,
  onForceDenseChange,
  metadataKeys,
  metadataFilters,
  onMetadataFilterChange,
  retrievalDiff,
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
  /** How many non-default options are set — the badge on the folded panel. */
  activeFilterCount: number;
  topK: number;
  onTopKChange: (value: number) => void;
  forceDense: boolean;
  onForceDenseChange: (value: boolean) => void;
  metadataKeys: string[] | null | undefined;
  metadataFilters: Record<string, string>;
  onMetadataFilterChange: (key: string, value: string) => void;
  retrievalDiff: KbSearchRetrievalDiff | null;
  onChunkView: (chunkId: string) => void;
  onChunkEdit: (chunkId: string) => void;
}) {
  return (
    <>
      <EntityViewHeader title={t('detail.searchTitle')} subtitle={t('detail.searchDesc')} />
      <EntityViewPanel>

      <div className="kb-search-type-tabs">
        {(['all', 'chunks', 'faqs'] as const).map((type) => (
          <button
            key={type}
            type="button"
            className={`kb-search-type-tab${searchType === type ? ' active' : ''}`}
            onClick={() => onSearchTypeChange(type)}
            aria-pressed={searchType === type}
          >
            {type === 'all'
              ? t('detail.searchTypeAll')
              : type === 'chunks'
                ? t('detail.searchTypeChunks')
                : t('detail.searchTypeFaqs')}
          </button>
        ))}
      </div>

      <form className="kb-search-form" onSubmit={onSubmit}>
        <SearchIcon size={20} />
        <input
          type="search"
          aria-label={t('detail.searchAria')}
          placeholder={t('detail.searchPlaceholder')}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="kb-search-input"
        />
        <button
          type="submit"
          className="kb-search-submit"
          disabled={searching}
          aria-label={searching ? t('detail.searching') : t('detail.search')}
        >
          <Send size={18} aria-hidden />
          <span className="ds-compact-label">
            {searching ? t('detail.searching') : t('detail.search')}
          </span>
        </button>
      </form>

      <div className="kb-search-options-wrap">
        <button
          type="button"
          className="kb-search-options-toggle"
          onClick={onToggleOptions}
          aria-expanded={optionsOpen}
        >
          {optionsOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          <Filter size={16} aria-hidden />
          <span>{t('detail.searchOptionsToggle')}</span>
          {activeFilterCount > 0 && (
            <span className="kb-search-options-badge">{t('detail.filtersActive')}</span>
          )}
        </button>
        {optionsOpen ? (
          <div className="kb-search-options-panel">
            <div className="kb-search-options-block">
              <div className="kb-search-options-block-title">
                {t('detail.searchOptionsRankingTitle')}
              </div>
              <div className="kb-search-options-row">
                <label className="kb-search-advanced-field">
                  <span>{t('detail.searchTopKLabel')}</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={topK}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      onTopKChange(Number.isFinite(n) ? Math.min(50, Math.max(1, Math.trunc(n))) : 10);
                    }}
                    className="ds-control"
                  />
                </label>
                <label className="kb-search-advanced-checkbox">
                  <input
                    type="checkbox"
                    checked={forceDense}
                    onChange={(e) => onForceDenseChange(e.target.checked)}
                  />
                  <span>{t('detail.searchForceDense')}</span>
                </label>
              </div>
              <p className="kb-search-advanced-hint">{t('detail.searchAdvancedHint')}</p>
            </div>

            {metadataKeys?.length ? (
              <>
                <hr className="kb-search-options-sep" />
                <div className="kb-search-options-block">
                  <div className="kb-search-options-block-title">{t('detail.metadataLabel')}</div>
                  <p className="kb-search-filters-hint">{t('detail.filtersHint')}</p>
                  <div className="kb-search-filters-group">
                    {metadataKeys.map((key) => (
                      <div key={key} className="kb-search-filter-row">
                        <label htmlFor={`search-meta-${key}`}>{key}</label>
                        <input
                          id={`search-meta-${key}`}
                          type="text"
                          placeholder={t('detail.placeholderMetaExample')}
                          value={metadataFilters[key] ?? ''}
                          onChange={(e) => onMetadataFilterChange(key, e.target.value)}
                          className="ds-control"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <hr className="kb-search-options-sep" />
                <p className="kb-search-options-empty-hint">{t('detail.metadataKeysEmptyHint')}</p>
              </>
            )}
          </div>
        ) : null}
      </div>

      {hasSearched && results.length > 0 && (
        <div className="kb-search-results-panel">
          <h3>{t('detail.resultsTitle', { count: results.length })}</h3>
          {retrievalDiff &&
          (retrievalDiff.added.length > 0 ||
            retrievalDiff.removed.length > 0 ||
            retrievalDiff.moved.length > 0) ? (
            <div className="kb-search-diff-panel" role="region" aria-label={t('detail.searchDiffAria')}>
              <h4 className="kb-search-diff-title">{t('detail.searchDiffTitle')}</h4>
              {retrievalDiff.added.length > 0 ? (
                <p className="kb-search-diff-line">
                  <strong>{t('detail.searchDiffAdded')}</strong> {retrievalDiff.added.length}
                </p>
              ) : null}
              {retrievalDiff.removed.length > 0 ? (
                <p className="kb-search-diff-line">
                  <strong>{t('detail.searchDiffRemoved')}</strong> {retrievalDiff.removed.length}
                </p>
              ) : null}
              {retrievalDiff.moved.length > 0 ? (
                <ul className="kb-search-diff-moves">
                  {retrievalDiff.moved.slice(0, 20).map((m) => (
                    <li key={m.id}>
                      {t('detail.searchDiffMoved', {
                        id: m.id.length > 24 ? `${m.id.slice(0, 20)}…` : m.id,
                        from: m.from + 1,
                        to: m.to + 1,
                      })}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <ul className="kb-search-results-list">
            {results.map((r) => (
              <li key={r.id} className="kb-search-result-item">
                <span className="kb-search-result-source">
                  [{r.source_type}]
                  {r.source_type === 'chunk' && r.wiki_page_id && r.wiki_space_id && (
                    <span className="kb-search-result-kind"> {t('detail.searchHitWiki')} </span>
                  )}{' '}
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
                <p className="kb-search-result-excerpt">{r.content.slice(0, 300)}</p>
                <span className="kb-search-result-score">
                  {t('detail.matchPercent', { pct: (r.score * 100).toFixed(0) })}
                </span>
                <ChatRetrievalProvenancePanel s={r} t={t} />
                {r.source_type === 'chunk' ? (
                  <div className="kb-search-result-chunk-actions">
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
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasSearched && results.length === 0 && (
        <p className="kb-empty-text">{t('detail.noSearchResults')}</p>
      )}

      {!hasSearched && (
        <div className="kb-search-empty">
          <SearchIcon size={48} strokeWidth={1} />
          <p>{t('detail.searchEmptyPrompt')}</p>
        </div>
      )}
      </EntityViewPanel>
    </>
  );
}
