import { Link } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { ChevronDown, ChevronRight, Filter, Search as SearchIcon, Send } from 'lucide-react';
import type { SearchResult } from '../../../../data/knowledgeBasesApi';
import type { KbSearchRetrievalDiff } from '../../KnowledgeBaseDetail.types';
import { CheckRow, EmptyState, FormField } from '../../../../styles/design-system';
import { EntityViewHeader, EntityViewPanel } from '../../../shared/EntityViewShell';
import { ChatRetrievalProvenancePanel } from '../../../workforce/chat';
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
  const searchTypeLabel = (type: KbSearchType) =>
    type === 'all'
      ? t('detail.searchTypeAll')
      : type === 'chunks'
        ? t('detail.searchTypeChunks')
        : t('detail.searchTypeFaqs');

  return (
    <>
      <EntityViewHeader title={t('detail.searchTitle')} subtitle={t('detail.searchDesc')} />

      <EntityViewPanel>
        <div className="entity-view__form">
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
              <FormField label={t('detail.searchTopKLabel')} hint={t('detail.searchAdvancedHint')}>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={topK}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    onTopKChange(
                      Number.isFinite(n) ? Math.min(50, Math.max(1, Math.trunc(n))) : 10,
                    );
                  }}
                />
              </FormField>

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
            <div className="entity-view__form">
              <h3>{t('detail.resultsTitle', { count: results.length })}</h3>

              {retrievalDiff &&
              (retrievalDiff.added.length > 0 ||
                retrievalDiff.removed.length > 0 ||
                retrievalDiff.moved.length > 0) ? (
                <div
                  className="kb-search-diff"
                  role="region"
                  aria-label={t('detail.searchDiffAria')}
                >
                  <h4>{t('detail.searchDiffTitle')}</h4>
                  {retrievalDiff.added.length > 0 ? (
                    <p>
                      <strong>{t('detail.searchDiffAdded')}</strong> {retrievalDiff.added.length}
                    </p>
                  ) : null}
                  {retrievalDiff.removed.length > 0 ? (
                    <p>
                      <strong>{t('detail.searchDiffRemoved')}</strong> {retrievalDiff.removed.length}
                    </p>
                  ) : null}
                  {retrievalDiff.moved.length > 0 ? (
                    <ul>
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

              <ul className="kb-search-results">
                {results.map((r) => (
                  <li key={r.id} className="kb-search-hit">
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
                      <span className="kb-search-hit-score">
                        {t('detail.matchPercent', { pct: (r.score * 100).toFixed(0) })}
                      </span>
                    </div>
                    <p className="kb-search-hit-excerpt">{r.content.slice(0, 300)}</p>
                    <ChatRetrievalProvenancePanel s={r} />
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
                  </li>
                ))}
              </ul>
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
