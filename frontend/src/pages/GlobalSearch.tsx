import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import { useDocumentChannels } from '../contexts/DocumentChannelsContext';
import { useArticleChannels } from '../contexts/ArticleChannelsContext';
import { useFeatureToggles } from '../contexts/FeatureTogglesContext';
import { fetchGlobalSearch, type GlobalSearchHit, type GlobalSearchResponse } from '../data/globalSearchApi';
import './GlobalSearch.css';

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

function normalizeTab(raw: string | null, isEnabled: (k: 'articles' | 'wikiSpaces' | 'knowledgeBases') => boolean): SearchTab {
  const t = (raw ?? 'all').trim().toLowerCase();
  if (t === 'documents') return 'documents';
  if (t === 'articles' && isEnabled('articles')) return 'articles';
  if (t === 'wiki_spaces' && isEnabled('wikiSpaces')) return 'wiki_spaces';
  if (t === 'knowledge_bases' && isEnabled('knowledgeBases')) return 'knowledge_bases';
  if (t === 'all' || t === '') return 'all';
  return 'all';
}

function sumEnabledTotals(
  d: GlobalSearchResponse,
  isEnabled: (k: 'articles' | 'wikiSpaces' | 'knowledgeBases') => boolean,
): number {
  let n = d.documents.total;
  if (isEnabled('articles')) n += d.articles.total;
  if (isEnabled('wikiSpaces')) n += d.wiki_spaces.total;
  if (isEnabled('knowledgeBases')) n += d.knowledge_bases.total;
  return n;
}

function tabResultCount(
  d: GlobalSearchResponse | null,
  id: SearchTab,
  isEnabled: (k: 'articles' | 'wikiSpaces' | 'knowledgeBases') => boolean,
): number | null {
  if (!d) return null;
  switch (id) {
    case 'all':
      return sumEnabledTotals(d, isEnabled);
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
  if (section.total === 0 && section.items.length === 0) {
    return (
      <section className="global-search-section" aria-labelledby={`search-${title}`}>
        <h2 id={`search-${title}`}>{title}</h2>
        <p className="global-search-empty">{emptyHint}</p>
      </section>
    );
  }
  return (
    <section className="global-search-section" aria-labelledby={`search-${title}`}>
      <h2 id={`search-${title}`}>{title}</h2>
      <p className="global-search-section-meta">
        {section.total} result{section.total === 1 ? '' : 's'}
        {section.total > section.items.length ? ' (showing first page)' : ''}
      </p>
      <ul className="global-search-list">
        {section.items.map((h) => (
          <HitRow key={`${h.kind}-${h.id}`} hit={h} />
        ))}
      </ul>
    </section>
  );
}

export function GlobalSearch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const qParam = searchParams.get('q') ?? '';
  const { channels: docChannels } = useDocumentChannels();
  const { channels: artChannels } = useArticleChannels();
  const { isEnabled } = useFeatureToggles();

  const activeTab = useMemo(
    () => normalizeTab(searchParams.get('tab'), isEnabled),
    [searchParams, isEnabled],
  );

  const tabDefs = useMemo(() => {
    const rows: { id: SearchTab; label: string }[] = [
      { id: 'all', label: 'All' },
      { id: 'documents', label: 'Documents' },
    ];
    if (isEnabled('articles')) rows.push({ id: 'articles', label: 'Articles' });
    if (isEnabled('wikiSpaces')) rows.push({ id: 'wiki_spaces', label: 'Wiki spaces' });
    if (isEnabled('knowledgeBases')) rows.push({ id: 'knowledge_bases', label: 'Knowledge bases' });
    return rows;
  }, [isEnabled]);

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
    const coerced = normalizeTab(raw, isEnabled);
    if (coerced === 'all') {
      const next = new URLSearchParams(searchParams);
      next.delete('tab');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, isEnabled, setSearchParams]);

  useEffect(() => {
    setDocChannel(searchParams.get('document_channel_id') ?? '');
    setArtChannel(searchParams.get('article_channel_id') ?? '');
    const ua = searchParams.get('updated_after');
    const ub = searchParams.get('updated_before');
    setUpdatedAfter(ua ? isoToDatetimeLocalValue(ua) : '');
    setUpdatedBefore(ub ? isoToDatetimeLocalValue(ub) : '');
  }, [searchParams]);

  /** Always request every enabled type so tab badges show correct totals for all tabs. */
  const typesParam = useMemo(() => {
    const parts: string[] = ['documents'];
    if (isEnabled('articles')) parts.push('articles');
    if (isEnabled('wikiSpaces')) parts.push('wiki_spaces');
    if (isEnabled('knowledgeBases')) parts.push('knowledge_bases');
    if (parts.length === 4) return 'all';
    return parts.join(',');
  }, [isEnabled]);

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
        setError(e instanceof Error ? e.message : 'Search failed');
      })
      .finally(() => setLoading(false));
  }, [qParam, typesParam, docChannel, artChannel, updatedAfter, updatedBefore]);

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
        <nav className="global-search-tabs" aria-label="Result type">
          {tabDefs.map(({ id, label }) => {
            const count = tabResultCount(data, id, isEnabled);
            const aria = count === null ? label : `${label}, ${count} results`;
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

        <div className="global-search-filters" role="region" aria-label="Search filters">
          <div className="global-search-filters-label">
            <SlidersHorizontal size={16} strokeWidth={2} aria-hidden />
            <span>Filters</span>
          </div>
          <div className="global-search-filters-fields">
            <label>
              Document channel
              <select value={docChannel} onChange={(e) => setDocChannel(e.target.value)} aria-label="Document channel">
                <option value="">Any</option>
                {docOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {isEnabled('articles') && (
              <label>
                Article channel
                <select value={artChannel} onChange={(e) => setArtChannel(e.target.value)} aria-label="Article channel">
                  <option value="">Any</option>
                  {artOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Updated after
              <input
                type="datetime-local"
                value={updatedAfter}
                onChange={(e) => setUpdatedAfter(e.target.value)}
                aria-label="Updated after"
              />
            </label>
            <label>
              Updated before
              <input
                type="datetime-local"
                value={updatedBefore}
                onChange={(e) => setUpdatedBefore(e.target.value)}
                aria-label="Updated before"
              />
            </label>
            <button type="button" className="btn btn-primary global-search-apply" onClick={applyFiltersToUrl}>
              Apply filters
            </button>
          </div>
        </div>
      </div>

      {loading && <p className="global-search-status">Loading…</p>}
      {error && <p className="global-search-error">{error}</p>}

      {data && !loading && (
        <div className="global-search-results">
          {show('documents') && (
            <Section
              title="Documents"
              section={data.documents}
              emptyHint="No matching documents."
            />
          )}
          {isEnabled('articles') && show('articles') && (
            <Section title="Articles" section={data.articles} emptyHint="No matching articles." />
          )}
          {isEnabled('wikiSpaces') && show('wiki_spaces') && (
            <Section title="Wiki spaces" section={data.wiki_spaces} emptyHint="No matching wiki spaces." />
          )}
          {isEnabled('knowledgeBases') && show('knowledge_bases') && (
            <Section
              title="Knowledge bases"
              section={data.knowledge_bases}
              emptyHint="No matching knowledge bases."
            />
          )}
        </div>
      )}
    </div>
  );
}
