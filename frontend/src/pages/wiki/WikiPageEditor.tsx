import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Components } from 'react-markdown';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import {
  richMarkdownPreComponent,
  richMarkdownRemarkPlugins,
  richMarkdownRehypePlugins,
} from '../../components/markdown/richMarkdown';
import { ArrowLeft, Network, Save } from 'lucide-react';
import { toast } from 'sonner';
import { config } from '../../config';
import { WikiPagesTree } from '../../components/wiki/WikiPagesTree';
import { fetchWikiPage, fetchWikiPages, updateWikiPage } from '../../data/wikiSpacesApi';
import type { WikiPageResponse } from '../../data/wikiSpacesApi';
import { findPageIdByWikilinkTarget, prepareWikiPreviewMarkdown } from './wikiPreviewMarkdown';
import './WikiPageEditor.css';

function previewUrlTransform(url: string): string {
  if (url.startsWith('wiki:')) return url;
  if (url.startsWith('#')) return url;
  if (url.startsWith('/')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('mailto:')) return url;
  return '';
}

export function WikiPageEditor() {
  const { t } = useTranslation('explore');
  const { id: spaceId, pageId } = useParams<{ id: string; pageId: string }>();
  const [page, setPage] = useState<WikiPageResponse | null>(null);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'edit' | 'preview'>('preview');
  const [wikiPages, setWikiPages] = useState<WikiPageResponse[]>([]);
  const [pagesLoading, setPagesLoading] = useState(true);

  const load = useCallback(async () => {
    if (!spaceId || !pageId) return;
    setLoading(true);
    try {
      const p = await fetchWikiPage(spaceId, pageId);
      setPage(p);
      setBody(p.body);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('wiki.pageEditor.loadFailed'));
      setPage(null);
    } finally {
      setLoading(false);
    }
  }, [spaceId, pageId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setTab('preview');
  }, [pageId]);

  useEffect(() => {
    if (!spaceId) return;
    let cancelled = false;
    setPagesLoading(true);
    void fetchWikiPages(spaceId)
      .then((r) => {
        if (!cancelled) setWikiPages(r.items);
      })
      .catch(() => {
        if (!cancelled) setWikiPages([]);
      })
      .finally(() => {
        if (!cancelled) setPagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  const markdownComponents = useMemo<Components>(
    () => ({
      pre: richMarkdownPreComponent(),
      img: ({ src, alt, ...props }) => {
        let u = src || '';
        if (u.startsWith('/api/')) u = `${config.apiUrl}${u}`;
        return <img src={u} alt={alt ?? ''} loading="lazy" {...props} />;
      },
      a: ({ href, children }) => {
        if (href?.startsWith('wiki:')) {
          let target = '';
          try {
            target = decodeURIComponent(href.slice(5));
          } catch {
            target = href.slice(5);
          }
          const resolved = findPageIdByWikilinkTarget(target, wikiPages);
          if (resolved && spaceId) {
            return (
              <Link
                to={`/wikis/${spaceId}/pages/${resolved}`}
                className="wiki-page-editor-wikilink wiki-page-editor-wikilink--internal"
                title={target}
              >
                {children as ReactNode}
              </Link>
            );
          }
          return (
            <span
              className="wiki-page-editor-wikilink wiki-page-editor-wikilink--missing"
              title={t('wiki.pageEditor.wikilinkMissing', { target })}
            >
              {children as ReactNode}
            </span>
          );
        }
        let h = href || '';
        if (h.startsWith('/api/')) h = `${config.apiUrl}${h}`;
        const external = h.startsWith('http://') || h.startsWith('https://');
        return (
          <a
            href={h}
            {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
          >
            {children as ReactNode}
          </a>
        );
      },
    }),
    [spaceId, wikiPages, t]
  );

  const previewSource = useMemo(() => prepareWikiPreviewMarkdown(body), [body]);

  const handleSave = async () => {
    if (!spaceId || !pageId) return;
    setSaving(true);
    try {
      const p = await updateWikiPage(spaceId, pageId, { body });
      setPage(p);
      toast.success(t('wiki.pageEditor.saved'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('wiki.pageEditor.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!spaceId || !pageId) {
    return <p className="wiki-page-editor-muted">{t('wiki.pageEditor.missingParams')}</p>;
  }

  return (
    <div className="wiki-page-editor-outer">
      <div className="wiki-page-editor">
        <div className="wiki-page-editor-shell">
          <WikiPagesTree
            spaceId={spaceId}
            pages={wikiPages}
            currentPageId={pageId}
            loading={pagesLoading}
          />
          <div className="wiki-page-editor-main">
            <div className="wiki-page-editor-toolbar">
              <Link to={`/wikis/${spaceId}`} className="wiki-page-editor-back">
                <ArrowLeft size={18} />
                {t('wiki.pageEditor.backToSpace')}
              </Link>
              <div className="wiki-page-editor-tabs">
                <button
                  type="button"
                  className={tab === 'edit' ? 'active' : ''}
                  onClick={() => setTab('edit')}
                >
                  {t('wiki.pageEditor.edit')}
                </button>
                <button
                  type="button"
                  className={tab === 'preview' ? 'active' : ''}
                  onClick={() => setTab('preview')}
                >
                  {t('wiki.pageEditor.preview')}
                </button>
              </div>
              <Link
                to={`/wikis/${spaceId}/graph?focus=${encodeURIComponent(pageId)}`}
                className="btn btn-secondary wiki-page-editor-graph-link"
                title={t('wiki.pageEditor.graphViewTitle')}
              >
                <Network size={18} />
                {t('wiki.pageEditor.graphView')}
              </Link>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void handleSave()}>
                <Save size={18} />
                {saving ? t('wiki.pageEditor.saving') : t('wiki.pageEditor.save')}
              </button>
            </div>

            {loading && <p className="wiki-page-editor-muted wiki-page-editor-status">{t('wiki.pageEditor.loadingPage')}</p>}

            {!loading && page && (
              <div className="wiki-page-editor-workspace">
                <div className="wiki-page-editor-meta">
                  <code className="wiki-page-editor-path">{page.path}</code>
                </div>
                {tab === 'edit' ? (
                  <textarea
                    className="wiki-page-editor-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    spellCheck
                  />
                ) : (
                  <div className="wiki-page-editor-preview">
                    <div className="wiki-page-editor-preview-scroll">
                      <article className="wiki-page-editor-markdown">
                        <ReactMarkdown
                          remarkPlugins={richMarkdownRemarkPlugins}
                          rehypePlugins={richMarkdownRehypePlugins}
                          urlTransform={previewUrlTransform}
                          components={markdownComponents}
                        >
                          {previewSource}
                        </ReactMarkdown>
                      </article>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!loading && !page && (
              <p className="wiki-page-editor-muted wiki-page-editor-status">{t('wiki.pageEditor.couldNotLoad')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
