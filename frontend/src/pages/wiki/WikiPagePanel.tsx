import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Components } from 'react-markdown';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import {
  richMarkdownPreComponent,
  richMarkdownRemarkPlugins,
  richMarkdownRehypePlugins,
} from '../../components/markdown/richMarkdown';
import { toast } from 'sonner';
import { config } from '../../config';
import { fetchWikiPage, updateWikiPage } from '../../data/wikiSpacesApi';
import type { WikiPageListItem, WikiPageResponse } from '../../data/wikiSpacesApi';
import { findPageIdByWikilinkTarget, prepareWikiPreviewMarkdown } from './wikiPreviewMarkdown';
import './WikiPageEditor.scss';

function previewUrlTransform(url: string): string {
  if (url.startsWith('wiki:')) return url;
  if (url.startsWith('#')) return url;
  if (url.startsWith('/')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('mailto:')) return url;
  return '';
}

export type WikiPagePanelHandle = {
  save: () => Promise<void>;
};

export type WikiPagePanelProps = {
  spaceId: string;
  pageId: string;
  wikiPages: readonly WikiPageListItem[];
  isActive: boolean;
  viewTab: 'edit' | 'preview';
  onSavingChange?: (saving: boolean) => void;
  /** Called when page metadata is known (for workspace tab labels). */
  onPageMeta?: (pageId: string, path: string) => void;
};

export const WikiPagePanel = forwardRef<WikiPagePanelHandle, WikiPagePanelProps>(function WikiPagePanel(
  { spaceId, pageId, wikiPages, isActive, viewTab, onSavingChange, onPageMeta },
  ref
) {
  const { t } = useTranslation('explore');
  const [page, setPage] = useState<WikiPageResponse | null>(null);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await fetchWikiPage(spaceId, pageId);
      setPage(p);
      setBody(p.body);
      onPageMeta?.(pageId, p.path);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('wiki.pageEditor.loadFailed'));
      setPage(null);
    } finally {
      setLoading(false);
    }
  }, [spaceId, pageId, t, onPageMeta]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    onSavingChange?.(true);
    try {
      const p = await updateWikiPage(spaceId, pageId, { body });
      setPage(p);
      toast.success(t('wiki.pageEditor.saved'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('wiki.pageEditor.saveFailed'));
    } finally {
      setSaving(false);
      onSavingChange?.(false);
    }
  }, [spaceId, pageId, body, t, onSavingChange]);

  useImperativeHandle(
    ref,
    () => ({
      save: () => handleSave(),
    }),
    [handleSave]
  );

  useEffect(() => {
    onSavingChange?.(saving);
  }, [saving, onSavingChange]);

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
          <a href={h} {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}>
            {children as ReactNode}
          </a>
        );
      },
    }),
    [spaceId, wikiPages, t]
  );

  const previewSource = useMemo(() => prepareWikiPreviewMarkdown(body), [body]);

  return (
    <div
      className={`wiki-page-panel-shell${isActive ? ' wiki-page-panel-shell--active' : ''}`}
      aria-hidden={!isActive}
    >
      {loading && (
        <p className="wiki-page-editor-muted wiki-page-editor-status wiki-page-panel-status">{t('wiki.pageEditor.loadingPage')}</p>
      )}

      {!loading && page && (
        <div className="wiki-page-editor-workspace wiki-page-panel-workspace">
          {viewTab === 'edit' ? (
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
        <p className="wiki-page-editor-muted wiki-page-editor-status wiki-page-panel-status">{t('wiki.pageEditor.couldNotLoad')}</p>
      )}
    </div>
  );
});
