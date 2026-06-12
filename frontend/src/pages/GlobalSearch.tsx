import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import { useEnsureDocumentChannels } from '../contexts/DocumentChannelsContext';
import { useEnsureArticleChannels } from '../contexts/ArticleChannelsContext';
import { fetchGlobalSearch, type GlobalSearchHit, type GlobalSearchResponse } from '../data/globalSearchApi';
import './GlobalSearch.scss';

type SearchTab = 'all' | 'documents' | 'articles' | 'wiki_spaces' | 'knowledge_bases';

function formatUpdated(iso: string): string {
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  } catch {
    return iso;
  }
}

function isoToDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localDatetimeInputToIso(local: string): string | undefined {
  if (!local.trim()) return undefined;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function normalizeTab(raw: string | null): SearchTab {
  const t = (raw ?? 'all').trim().toLowerCase();
  if (t === 'documents') return 'documents';
  if (t === 'articles') return 'articles';
  if (t === 'wiki_spaces') return 'wiki_spaces';
  if (t === 'knowledge_bases') return 'knowledge_bases';
  if (t === 'all' || t === '') return 'all';
  return 'all';
}

function sumAllTotals(d: GlobalSearchResponse): number {
  return d.documents.total + d.articles.total + d.wiki_spaces.total + d.knowledge_bases.total;
}

function tabResultCount(d: GlobalSearchResponse | null, id: SearchTab): number | null {
  if (!d) return null;
  switch (id) {
    case 'all':
      return sumAllTotals(d);
    case 'documents':
      return d.documents.total;
    case 'articles':
      return d.articles.total;
    case 'wiki_spaces':
      return d.wiki_spaces.total;
    case 'knowledge_bases':
      return d.knowledge_bases.total;
    default:
      return null;
  }
}

function HitRow({ hit }: { hit: GlobalSearchHit }) {
  const label = hit.title ?? hit.name;
  const channel = hit.channel_name ? ` · ${hit.channel_name}` : '';
  return (
    <li>
      <Link to={hit.url_path}>
        <div className="global-search-hit-title">{label}</div>
        <div className="global-search-hit-meta">
          {formatUpdated(hit.updated_at)}
          {channel}
        </div>
      </Link>
    </li>
  );
}

function Section({
  title,
  section,
  emptyHint,
}: {
  title: string;
  section: GlobalSearchResponse['documents'];
  emptyHint: string;
}) {
  const { t } = useTranslation('search');
  if (section.total === 0 && section.items.length === 0) {
    return (
      <section className="global-search-section" aria-labelledby={`search-${title}`}>
        <h2 id={`search-${title}`}>{title}</h2>
        <p className="global-search-empty">{emptyHint}</p>
      </section>
    );
  }
  const resultsLine =
    `${t('resultsCount', { count: section.total })}` +
    (section.total > section.items.length ? ` ${t('firstPageSuffix')}` : '');
  return (
    <section className="global-search-section" aria-labelledby={`search-${title}`}>
      <h2 id={`search-${title}`}>{title}</h2>
      <p className="global-search-section-meta">{resultsLine}</p>
      <ul className="global-search-list">
        {section.items.map((h) => (
          <HitRow key={`${h.kind}-${h.id}`} hit={h} />
        ))}
      </ul>
    </section>
  );
}

export function GlobalSearch() {
  const { t } = useTranslation('search');
  const [searchParams, setSearchParams] = useSearchParams();
  const qParam = searchParams.get('q') ?? '';
  const { channels: docChannels } = useEnsureDocumentChannels();
  const { channels: artChannels } = useEnsureArticleChannels();
  const activeTab = useMemo(() => normalizeTab(searchParams.get('tab')), [searchParams]);

  const tabDefs = useMemo(
    () => [
      { id: 'all' as const, label: t('tabAll') },
      { id: 'documents' as const, label: t('tabDocuments') },
      { id: 'articles' as const, label: t('tabArticles') },
      { id: 'wiki_spaces' as const, label: t('tabWikiSpaces') },
      { id: 'knowledge_bases' as const, label: t('tabKnowledgeBases') },
    ],
    [t],
  );

  const [docChannel, setDocChannel] = useState(searchParams.get('document_channel_id') ?? '');
  const [artChannel, setArtChannel] = useState(searchParams.get('article_channel_id') ?? '');
  const [updatedAfter, setUpdatedAfter] = useState('');
  const [updatedBefore, setUpdatedBefore] = useState('');

  const [data, setData] = useState<GlobalSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = searchParams.get('tab');
    if (!raw || raw.trim().toLowerCase() === 'all') return;
    const coerced = normalizeTab(raw);
    if (coerced === 'all') {
      const next = new URLSearchParams(searchParams);
      next.delete('tab');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    setDocChannel(searchParams.get('document_channel_id') ?? '');
    setArtChannel(searchParams.get('article_channel_id') ?? '');
    const ua = searchParams.get('updated_after');
    const ub = searchParams.get('updated_before');
    setUpdatedAfter(ua ? isoToDatetimeLocalValue(ua) : '');
    setUpdatedBefore(ub ? isoToDatetimeLocalValue(ub) : '');
  }, [searchParams]);

  /** Request all entity kinds so tab badges match section totals. */
  const typesParam = 'all';

  const runSearch = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchGlobalSearch({
      q: qParam.trim() || undefined,
      types: typesParam,
      document_channel_id: docChannel || undefined,
      article_channel_id: artChannel || undefined,
      updated_after: localDatetimeInputToIso(updatedAfter),
      updated_before: localDatetimeInputToIso(updatedBefore),
      limit: 30,
    })
      .then(setData)
      .catch((e: unknown) => {
        setData(null);
        setError(e instanceof Error ? e.message : t('searchFailed'));
      })
      .finally(() => setLoading(false));
  }, [qParam, typesParam, docChannel, artChannel, updatedAfter, updatedBefore, t]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      runSearch();
    }, 300);
    return () => window.clearTimeout(t);
  }, [runSearch]);

  const setTab = (id: SearchTab) => {
    const next = new URLSearchParams(searchParams);
    if (id === 'all') {
      next.delete('tab');
    } else {
      next.set('tab', id);
    }
    setSearchParams(next, { replace: true });
  };

  const applyFiltersToUrl = () => {
    const next = new URLSearchParams(searchParams);
    if (qParam.trim()) next.set('q', qParam.trim());
    else next.delete('q');
    if (docChannel) next.set('document_channel_id', docChannel);
    else next.delete('document_channel_id');
    if (artChannel) next.set('article_channel_id', artChannel);
    else next.delete('article_channel_id');
    const ua = localDatetimeInputToIso(updatedAfter);
    const ub = localDatetimeInputToIso(updatedBefore);
    if (ua) next.set('updated_after', ua);
    else next.delete('updated_after');
    if (ub) next.set('updated_before', ub);
    else next.delete('updated_before');
    setSearchParams(next, { replace: true });
  };

  const docOptions = useMemo(() => {
    const flat: { id: string; label: string }[] = [];
    const walk = (nodes: typeof docChannels, prefix: string) => {
      for (const n of nodes) {
        const label = prefix ? `${prefix} / ${n.name}` : n.name;
        flat.push({ id: n.id, label });
        if (n.children?.length) walk(n.children, label);
      }
    };
    walk(docChannels, '');
    return flat;
  }, [docChannels]);

  const artOptions = useMemo(() => {
    const flat: { id: string; label: string }[] = [];
    const walk = (nodes: typeof artChannels, prefix: string) => {
      for (const n of nodes) {
        const label = prefix ? `${prefix} / ${n.name}` : n.name;
        flat.push({ id: n.id, label });
        if (n.children?.length) walk(n.children, label);
      }
    };
    walk(artChannels, '');
    return flat;
  }, [artChannels]);

  const show = (kind: SearchTab) => activeTab === 'all' || activeTab === kind;

  return (
    <div className="global-search">
      <div className="global-search-results-shell">
        <nav className="global-search-tabs" aria-label={t('resultTypeNav')}>
          {tabDefs.map(({ id, label }) => {
            const count = tabResultCount(data, id);
            const aria = count === null ? label : t('tabAria', { label, count });
            return (
              <button
                key={id}
                type="button"
                className={`global-search-tab${activeTab === id ? ' global-search-tab--active' : ''}`}
                aria-current={activeTab === id ? 'page' : undefined}
                aria-label={aria}
                onClick={() => setTab(id)}
              >
                <span className="global-search-tab-text">{label}</span>
                {count !== null && <span className="global-search-tab-count">{count}</span>}
              </button>
            );
          })}
        </nav>

        <div className="global-search-filters" role="region" aria-label={t('filtersRegionAria')}>
          <div className="global-search-filters-label">
            <SlidersHorizontal size={16} strokeWidth={2} aria-hidden />
            <span>{t('filters')}</span>
          </div>
          <div className="global-search-filters-fields">
            <label>
              {t('documentChannel')}
              <select value={docChannel} onChange={(e) => setDocChannel(e.target.value)} aria-label={t('documentChannel')}>
                <option value="">{t('channelAny')}</option>
                {docOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('articleChannel')}
              <select value={artChannel} onChange={(e) => setArtChannel(e.target.value)} aria-label={t('articleChannel')}>
                <option value="">{t('channelAny')}</option>
                {artOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('updatedAfter')}
              <input
                type="datetime-local"
                value={updatedAfter}
                onChange={(e) => setUpdatedAfter(e.target.value)}
                aria-label={t('updatedAfter')}
              />
            </label>
            <label>
              {t('updatedBefore')}
              <input
                type="datetime-local"
                value={updatedBefore}
                onChange={(e) => setUpdatedBefore(e.target.value)}
                aria-label={t('updatedBefore')}
              />
            </label>
            <button type="button" className="btn btn-primary global-search-apply" onClick={applyFiltersToUrl}>
              {t('applyFilters')}
            </button>
          </div>
        </div>
      </div>

      {loading && <p className="global-search-status">{t('loading')}</p>}
      {error && <p className="global-search-error">{error}</p>}

      {data && !loading && (
        <div className="global-search-results">
          {show('documents') && (
            <Section
              title={t('sectionDocuments')}
              section={data.documents}
              emptyHint={t('emptyDocuments')}
            />
          )}
          {show('articles') && (
            <Section title={t('sectionArticles')} section={data.articles} emptyHint={t('emptyArticles')} />
          )}
          {show('wiki_spaces') && (
            <Section title={t('sectionWikiSpaces')} section={data.wiki_spaces} emptyHint={t('emptyWikiSpaces')} />
          )}
          {show('knowledge_bases') && (
            <Section
              title={t('sectionKnowledgeBases')}
              section={data.knowledge_bases}
              emptyHint={t('emptyKnowledgeBases')}
            />
          )}
        </div>
      )}
    </div>
  );
}
