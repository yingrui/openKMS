import { useCallback, useEffect, useMemo, useState, type AnchorHTMLAttributes, type ImgHTMLAttributes } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, Info, Paperclip, Save, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { toast } from 'sonner';
import 'katex/dist/katex.min.css';
import { useArticleChannels } from '../contexts/ArticleChannelsContext';
import { getDocumentChannelName } from '../data/channelUtils';
import {
  articleFileUrl,
  deleteArticle,
  fetchArticle,
  fetchArticleAttachments,
  patchArticle,
  putArticleMarkdown,
  type ArticleAttachmentOut,
  type ArticleOut,
} from '../data/articlesApi';
import './ArticleDetail.css';

function resolveMarkdownSrc(articleId: string, src: string | undefined): string | undefined {
  if (!src) return undefined;
  const s = src.trim();
  if (/^https?:\/\//i.test(s) || s.startsWith('data:')) return s;
  const path = s.replace(/^\.\//, '');
  if (path.startsWith('images/') || path.startsWith('attachments/')) {
    return articleFileUrl(articleId, path);
  }
  return s;
}

function resolveMarkdownHref(articleId: string, href: string | undefined): string | undefined {
  if (!href) return undefined;
  const h = href.trim();
  if (/^https?:\/\//i.test(h) || h.startsWith('#') || h.startsWith('mailto:')) return h;
  const path = h.replace(/^\.\//, '');
  if (path.startsWith('images/') || path.startsWith('attachments/')) {
    return articleFileUrl(articleId, path);
  }
  return h;
}

export function ArticleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { channels } = useArticleChannels();
  const [infoVisible, setInfoVisible] = useState(true);
  const [article, setArticle] = useState<ArticleOut | null>(null);
  const [attachments, setAttachments] = useState<ArticleAttachmentOut[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editMarkdown, setEditMarkdown] = useState('');
  const [contentTab, setContentTab] = useState<'write' | 'preview'>('write');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const [a, att] = await Promise.all([fetchArticle(id), fetchArticleAttachments(id)]);
      setArticle(a);
      setAttachments(att);
    } catch (e) {
      setArticle(null);
      setAttachments([]);
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!article) return;
    setEditName(article.name);
    setEditSlug(article.slug ?? '');
    setEditMarkdown(article.markdown ?? '');
  }, [article]);

  const mdComponents = useMemo(() => {
    if (!id) return undefined;
    return {
      img: ({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) => (
        <img src={resolveMarkdownSrc(id, src)} alt={alt ?? ''} {...props} />
      ),
      a: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a href={resolveMarkdownHref(id, href)} target="_blank" rel="noopener noreferrer" {...props}>
          {children}
        </a>
      ),
    };
  }, [id]);

  const backTo =
    article?.channel_id != null && article.channel_id !== ''
      ? `/articles/channels/${article.channel_id}`
      : '/articles';

  const channelLabel =
    article && channels.length > 0 ? getDocumentChannelName(channels, article.channel_id) : article?.channel_id ?? '';

  const handleSave = async () => {
    if (!id || !article) return;
    const name = editName.trim();
    if (!name) {
      toast.error('Title is required');
      return;
    }
    setSaving(true);
    try {
      await patchArticle(id, {
        name,
        slug: editSlug.trim() || null,
      });
      await putArticleMarkdown(id, editMarkdown.trim() || null);
      await load();
      toast.success('Article saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !article) return;
    if (!window.confirm(`Delete “${article.name}”? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteArticle(id);
      toast.success('Article deleted');
      navigate(backTo);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="article-detail">
      <Link to={backTo} className="article-detail-back">
        <ArrowLeft size={18} />
        <span>Back to Articles</span>
      </Link>
      {error ? (
        <div className="article-detail-error">{error}</div>
      ) : !article ? (
        <div className="article-detail-error">Loading…</div>
      ) : (
        <>
          <div className="article-detail-toolbar">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              <Save size={18} />
              <span>{saving ? 'Saving…' : 'Save'}</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary article-detail-delete"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              <Trash2 size={18} />
              <span>{deleting ? 'Deleting…' : 'Delete'}</span>
            </button>
          </div>

          <section className="article-detail-edit">
            <div className="article-detail-edit-field">
              <label htmlFor="article-edit-title">Title</label>
              <input
                id="article-edit-title"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Article title"
                autoComplete="off"
              />
            </div>
            <div className="article-detail-edit-field">
              <label htmlFor="article-edit-slug">Slug (optional)</label>
              <input
                id="article-edit-slug"
                type="text"
                value={editSlug}
                onChange={(e) => setEditSlug(e.target.value)}
                placeholder="url-friendly-name"
                autoComplete="off"
              />
            </div>
          </section>

          <section className={`article-detail-info ${infoVisible ? '' : 'article-detail-info--collapsed'}`}>
            <h2
              className="article-detail-info-title article-detail-info-toggle"
              onClick={() => setInfoVisible((v) => !v)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setInfoVisible((v) => !v)}
              aria-expanded={infoVisible}
            >
              <Info size={20} />
              <span>More details</span>
              <button
                type="button"
                className="article-detail-info-toggle-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setInfoVisible((v) => !v);
                }}
                aria-label={infoVisible ? 'Hide details' : 'Show details'}
              >
                {infoVisible ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            </h2>
            {infoVisible && (
              <dl className="article-detail-info-list">
                <div className="article-detail-info-item article-detail-info-item--compact">
                  <dt>Channel</dt>
                  <dd>{channelLabel}</dd>
                </div>
                <div className="article-detail-info-item article-detail-info-item--compact">
                  <dt>Lifecycle</dt>
                  <dd>{article.lifecycle_status ?? '—'}</dd>
                </div>
                <div className="article-detail-info-item article-detail-info-item--compact">
                  <dt>Applicable</dt>
                  <dd>{article.is_current_for_rag ? 'Yes' : 'No'}</dd>
                </div>
                <div className="article-detail-info-item article-detail-info-item--compact">
                  <dt>Series</dt>
                  <dd>{article.series_id}</dd>
                </div>
                {article.origin_article_id && (
                  <div className="article-detail-info-item article-detail-info-item--compact">
                    <dt>Origin id</dt>
                    <dd>{article.origin_article_id}</dd>
                  </div>
                )}
                <div className="article-detail-info-item article-detail-info-item--compact">
                  <dt>Updated</dt>
                  <dd>{new Date(article.updated_at).toLocaleString()}</dd>
                </div>
              </dl>
            )}
          </section>
          {attachments.length > 0 && (
            <section className="article-detail-attachments">
              <h2 className="article-detail-content-title">
                <Paperclip size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                Attachments
              </h2>
              <ul className="article-detail-attachments-list">
                {attachments.map((att) => (
                  <li key={att.id}>
                    <a
                      href={articleFileUrl(article.id, att.storage_path)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {att.original_filename}
                    </a>
                    <span className="article-detail-muted"> ({att.size_bytes} bytes)</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="article-detail-content">
            <div className="article-detail-content-head">
              <h2 className="article-detail-content-title">Content</h2>
              <div className="article-detail-content-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={contentTab === 'write'}
                  className={`article-detail-content-tab ${contentTab === 'write' ? 'active' : ''}`}
                  onClick={() => setContentTab('write')}
                >
                  Write
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={contentTab === 'preview'}
                  className={`article-detail-content-tab ${contentTab === 'preview' ? 'active' : ''}`}
                  onClick={() => setContentTab('preview')}
                >
                  Preview
                </button>
              </div>
            </div>
            <div className="article-detail-content-body">
              {contentTab === 'write' ? (
                <textarea
                  className="article-detail-markdown-input"
                  aria-label="Article body in Markdown"
                  placeholder="Write Markdown here…"
                  value={editMarkdown}
                  onChange={(e) => setEditMarkdown(e.target.value)}
                />
              ) : editMarkdown.trim() ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={mdComponents}
                >
                  {editMarkdown}
                </ReactMarkdown>
              ) : (
                <p className="article-detail-muted">Nothing to preview yet.</p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
