import { useCallback, useEffect, useMemo, useRef, useState, type AnchorHTMLAttributes, type ClipboardEvent, type DragEvent, type ImgHTMLAttributes } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  GitBranch,
  Image as ImageIcon,
  Info,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
  X as XIcon,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { toast } from 'sonner';
import 'katex/dist/katex.min.css';
import { useArticleChannels } from '../contexts/ArticleChannelsContext';
import { getDocumentChannelName } from '../data/channelUtils';
import {
  ARTICLE_RELATION_TYPES,
  articleFileUrl,
  createArticleRelationship,
  deleteArticle,
  deleteArticleAttachment,
  deleteArticleRelationship,
  fetchArticle,
  fetchArticleAttachments,
  fetchArticleRelationships,
  patchArticle,
  putArticleMarkdown,
  uploadArticleAttachment,
  uploadArticleImage,
  type ArticleAttachmentOut,
  type ArticleOut,
  type ArticleRelationshipsResponse,
} from '../data/articlesApi';
import './DocumentDetail.css';
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

const MARKDOWN_SPLIT_GUTTER_PX = 6;
const MARKDOWN_SPLIT_EDITOR_FR_MIN = 18;
const MARKDOWN_SPLIT_EDITOR_FR_MAX = 82;

export function ArticleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { channels } = useArticleChannels();
  const [infoVisible, setInfoVisible] = useState(true);
  const [article, setArticle] = useState<ArticleOut | null>(null);
  const [attachments, setAttachments] = useState<ArticleAttachmentOut[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSourceRef, setEditSourceRef] = useState('');
  const [editMarkdown, setEditMarkdown] = useState('');
  const [titleEditMode, setTitleEditMode] = useState(false);
  const [sourceEditMode, setSourceEditMode] = useState(false);
  const [markdownEditMode, setMarkdownEditMode] = useState(false);
  const [markdownPreviewOpen, setMarkdownPreviewOpen] = useState(false);
  /** Left pane weight when split (fr); right is `100 - this`. Clamped while dragging. */
  const [markdownSplitEditorFr, setMarkdownSplitEditorFr] = useState(50);
  const [savingTitle, setSavingTitle] = useState(false);
  const [savingSource, setSavingSource] = useState(false);
  const [savingMarkdown, setSavingMarkdown] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [relSectionOpen, setRelSectionOpen] = useState(false);
  const [lineageRels, setLineageRels] = useState<ArticleRelationshipsResponse | null>(null);
  const [lineageLoading, setLineageLoading] = useState(false);
  const [newRelTarget, setNewRelTarget] = useState('');
  const [newRelType, setNewRelType] = useState<string>('supersedes');
  const [newRelNote, setNewRelNote] = useState('');
  const [relSaving, setRelSaving] = useState(false);
  const [attachmentsSectionOpen, setAttachmentsSectionOpen] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const markdownSplitLayoutRef = useRef<HTMLDivElement | null>(null);

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
    setEditSourceRef(article.origin_article_id ?? '');
    setEditMarkdown(article.markdown ?? '');
    setTitleEditMode(false);
    setSourceEditMode(false);
    setMarkdownEditMode(false);
    setMarkdownPreviewOpen(false);
    setMarkdownSplitEditorFr(50);
  }, [article]);

  useEffect(() => {
    setRelSectionOpen(false);
    setAttachmentsSectionOpen(false);
    setLineageRels(null);
  }, [id]);

  useEffect(() => {
    if (attachments.length > 0) {
      setAttachmentsSectionOpen(true);
    }
  }, [attachments.length]);

  const refreshRelationships = useCallback(async () => {
    if (!id) return;
    setLineageLoading(true);
    try {
      const data = await fetchArticleRelationships(id);
      setLineageRels(data);
    } catch {
      setLineageRels(null);
    } finally {
      setLineageLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!relSectionOpen || !id) return;
    void refreshRelationships();
  }, [relSectionOpen, id, refreshRelationships]);

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

  const handleSaveTitle = async () => {
    if (!id || !article) return;
    const name = editName.trim();
    if (!name) {
      toast.error('Title is required');
      return;
    }
    setSavingTitle(true);
    try {
      await patchArticle(id, { name });
      await load();
      toast.success('Title saved');
      setTitleEditMode(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingTitle(false);
    }
  };

  const handleCancelTitleEdit = () => {
    if (!article) return;
    setEditName(article.name);
    setTitleEditMode(false);
  };

  const handleSaveSource = async () => {
    if (!id) return;
    setSavingSource(true);
    try {
      await patchArticle(id, { origin_article_id: editSourceRef.trim() || null });
      await load();
      toast.success('Source saved');
      setSourceEditMode(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingSource(false);
    }
  };

  const handleCancelSourceEdit = () => {
    if (!article) return;
    setEditSourceRef(article.origin_article_id ?? '');
    setSourceEditMode(false);
  };

  const handleAddRelationship = async () => {
    if (!id || !newRelTarget.trim()) {
      toast.error('Target article ID required');
      return;
    }
    setRelSaving(true);
    try {
      await createArticleRelationship(id, {
        target_article_id: newRelTarget.trim(),
        relation_type: newRelType,
        note: newRelNote.trim() || null,
      });
      setNewRelTarget('');
      setNewRelNote('');
      await refreshRelationships();
      toast.success('Relationship added');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add');
    } finally {
      setRelSaving(false);
    }
  };

  const handleDeleteRelationship = async (relationshipId: string) => {
    if (!id) return;
    try {
      await deleteArticleRelationship(id, relationshipId);
      await refreshRelationships();
      toast.success('Removed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove');
    }
  };

  const insertAtCursor = useCallback((snippet: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setEditMarkdown((prev) => `${prev}${prev && !prev.endsWith('\n') ? '\n' : ''}${snippet}`);
      return;
    }
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    const needsLeadingNl = before && !before.endsWith('\n') ? '\n' : '';
    const needsTrailingNl = after && !after.startsWith('\n') ? '\n' : '';
    const next = `${before}${needsLeadingNl}${snippet}${needsTrailingNl}${after}`;
    setEditMarkdown(next);
    const cursor = (before + needsLeadingNl + snippet).length;
    requestAnimationFrame(() => {
      ta.focus();
      try {
        ta.setSelectionRange(cursor, cursor);
      } catch {
        /* ignore */
      }
    });
  }, []);

  const insertImageRef = useCallback(
    (relPath: string, alt?: string) => {
      const safeAlt = (alt || relPath.split('/').pop() || 'image').replace(/[\[\]]/g, '');
      insertAtCursor(`![${safeAlt}](${relPath})`);
    },
    [insertAtCursor],
  );

  const insertAttachmentRef = useCallback(
    (relPath: string, label?: string) => {
      const text = (label || relPath.split('/').pop() || 'file').replace(/[\[\]]/g, '');
      insertAtCursor(`[${text}](${relPath})`);
    },
    [insertAtCursor],
  );

  const uploadImageFile = useCallback(
    async (file: File | Blob, name?: string) => {
      if (!id) return;
      setUploadingMedia(true);
      try {
        const res = await uploadArticleImage(id, file, name);
        insertImageRef(res.path, res.filename);
        toast.success('Image inserted');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Image upload failed');
      } finally {
        setUploadingMedia(false);
      }
    },
    [id, insertImageRef],
  );

  const uploadAttachmentFile = useCallback(
    async (file: File, opts?: { insertLink?: boolean }) => {
      if (!id) return;
      setUploadingMedia(true);
      try {
        const att = await uploadArticleAttachment(id, file);
        setAttachments((prev) => [...prev.filter((a) => a.id !== att.id), att]);
        if (opts?.insertLink !== false) {
          insertAttachmentRef(att.storage_path, att.original_filename);
        }
        toast.success('Attachment added');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Upload failed');
      } finally {
        setUploadingMedia(false);
      }
    },
    [id, insertAttachmentRef],
  );

  const handleEditorPaste = useCallback(
    async (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;
      const imageItems: File[] = [];
      for (let i = 0; i < items.length; i += 1) {
        const it = items[i];
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) imageItems.push(f);
        }
      }
      if (imageItems.length === 0) return;
      e.preventDefault();
      for (const f of imageItems) {
        const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
        const name = f.name && f.name !== 'image.png' ? f.name : `pasted-${Date.now()}.${ext}`;
        await uploadImageFile(f, name);
      }
    },
    [uploadImageFile],
  );

  const handleEditorDrop = useCallback(
    async (e: DragEvent<HTMLTextAreaElement>) => {
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      e.preventDefault();
      setDragActive(false);
      for (const f of files) {
        if (f.type.startsWith('image/')) {
          await uploadImageFile(f, f.name);
        } else {
          await uploadAttachmentFile(f);
        }
      }
    },
    [uploadAttachmentFile, uploadImageFile],
  );

  const handleImagePick = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = '';
      for (const f of files) {
        await uploadImageFile(f, f.name);
      }
    },
    [uploadImageFile],
  );

  const handleAttachmentPick = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = '';
      for (const f of files) {
        await uploadAttachmentFile(f);
      }
    },
    [uploadAttachmentFile],
  );

  const handleDeleteAttachment = useCallback(
    async (att: ArticleAttachmentOut) => {
      if (!id) return;
      if (!window.confirm(`Remove attachment “${att.original_filename}”?`)) return;
      try {
        await deleteArticleAttachment(id, att.id);
        setAttachments((prev) => prev.filter((a) => a.id !== att.id));
        toast.success('Attachment removed');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Remove failed');
      }
    },
    [id],
  );

  const handleSaveMarkdown = async () => {
    if (!id) return;
    setSavingMarkdown(true);
    try {
      await putArticleMarkdown(id, editMarkdown.trim() || null);
      await load();
      toast.success('Content saved');
      setMarkdownEditMode(false);
      setMarkdownPreviewOpen(false);
      setMarkdownSplitEditorFr(50);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingMarkdown(false);
    }
  };

  const handleCancelMarkdownEdit = () => {
    if (!article) return;
    setEditMarkdown(article.markdown ?? '');
    setMarkdownEditMode(false);
    setMarkdownPreviewOpen(false);
    setMarkdownSplitEditorFr(50);
  };

  const handleMarkdownSplitPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const layout = markdownSplitLayoutRef.current;
    if (!layout) return;
    handle.setPointerCapture(e.pointerId);

    const updateFromClientX = (clientX: number) => {
      const rect = layout.getBoundingClientRect();
      const w = rect.width;
      if (w <= MARKDOWN_SPLIT_GUTTER_PX) return;
      const inner = w - MARKDOWN_SPLIT_GUTTER_PX;
      const x = clientX - rect.left - MARKDOWN_SPLIT_GUTTER_PX / 2;
      const pct = (x / inner) * 100;
      const clamped = Math.round(
        Math.min(MARKDOWN_SPLIT_EDITOR_FR_MAX, Math.max(MARKDOWN_SPLIT_EDITOR_FR_MIN, pct)),
      );
      setMarkdownSplitEditorFr(clamped);
    };

    updateFromClientX(e.clientX);

    const onMove = (ev: PointerEvent) => {
      updateFromClientX(ev.clientX);
    };
    const onUp = (ev: PointerEvent) => {
      if (handle.hasPointerCapture(ev.pointerId)) {
        handle.releasePointerCapture(ev.pointerId);
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, []);

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
    <div className="document-detail article-detail-page">
      <Link to={backTo} className="document-detail-back">
        <ArrowLeft size={18} />
        <span>Back to Articles</span>
      </Link>
      {error ? (
        <div className="document-detail-error">{error}</div>
      ) : !article ? (
        <div className="document-detail-loading">Loading…</div>
      ) : (
        <>
          <section className={`document-detail-info document-detail-info-combined ${infoVisible ? '' : 'document-detail-info--collapsed'}`}>
            <h2
              className="document-detail-info-title document-detail-info-toggle"
              onClick={() => setInfoVisible((v) => !v)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setInfoVisible((v) => !v)}
              aria-expanded={infoVisible}
            >
              <Info size={20} />
              <span>Article information</span>
              <button
                type="button"
                className="document-detail-info-toggle-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setInfoVisible((v) => !v);
                }}
                aria-label={infoVisible ? 'Hide' : 'Show'}
              >
                {infoVisible ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            </h2>
            {infoVisible && (
              <div className="document-detail-info-body">
                <dl className="document-detail-info-list document-detail-info-list--name-row">
                  <div className="document-detail-info-item document-detail-info-item--name">
                    <dt>Title</dt>
                    <dd>
                      {titleEditMode ? (
                        <div className="article-detail-inline-edit">
                          <input
                            type="text"
                            className="document-detail-info-input article-detail-inline-edit-input"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            aria-label="Article title"
                            placeholder="Title"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && editName.trim()) void handleSaveTitle();
                              if (e.key === 'Escape') handleCancelTitleEdit();
                            }}
                          />
                          <div className="article-detail-inline-edit-actions">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => void handleSaveTitle()}
                              disabled={savingTitle || !editName.trim()}
                            >
                              {savingTitle ? <Loader2 size={12} className="doc-detail-spinner" /> : null}
                              <span>{savingTitle ? 'Saving…' : 'Save'}</span>
                            </button>
                            <button
                              type="button"
                              className="document-detail-info-cancel-btn"
                              onClick={handleCancelTitleEdit}
                              disabled={savingTitle}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="document-detail-info-value">
                          {editName}
                          <button
                            type="button"
                            className="document-detail-info-edit-btn"
                            onClick={() => setTitleEditMode(true)}
                            title="Edit title"
                            aria-label="Edit title"
                          >
                            <Edit3 size={12} />
                          </button>
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="document-detail-info-stats-grid">
                  <div className="document-detail-info-stats-col">
                    <dl className="document-detail-info-list document-detail-info-list--col">
                      <div className="document-detail-info-item document-detail-info-item--compact">
                        <dt>Channel</dt>
                        <dd>{channelLabel}</dd>
                      </div>
                      <div className="document-detail-info-item document-detail-info-item--compact">
                        <dt>Source</dt>
                        <dd className="article-detail-source-dd">
                          {sourceEditMode ? (
                            <div className="article-detail-inline-edit">
                              <input
                                type="text"
                                className="document-detail-info-input article-detail-inline-edit-input"
                                value={editSourceRef}
                                onChange={(e) => setEditSourceRef(e.target.value)}
                                aria-label="Source ID or URL"
                                placeholder="External ID or URL"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') void handleSaveSource();
                                  if (e.key === 'Escape') handleCancelSourceEdit();
                                }}
                              />
                              <div className="article-detail-inline-edit-actions">
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => void handleSaveSource()}
                                  disabled={savingSource}
                                >
                                  {savingSource ? <Loader2 size={12} className="doc-detail-spinner" /> : null}
                                  <span>{savingSource ? 'Saving…' : 'Save'}</span>
                                </button>
                                <button
                                  type="button"
                                  className="document-detail-info-cancel-btn"
                                  onClick={handleCancelSourceEdit}
                                  disabled={savingSource}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="document-detail-info-value">
                              {article.origin_article_id?.trim() ? (
                                /^https?:\/\//i.test(article.origin_article_id.trim()) ? (
                                  <a href={article.origin_article_id.trim()} target="_blank" rel="noopener noreferrer">
                                    {article.origin_article_id.trim()}
                                  </a>
                                ) : (
                                  <span title={article.origin_article_id}>{article.origin_article_id}</span>
                                )
                              ) : (
                                <span className="document-detail-muted">—</span>
                              )}
                              <button
                                type="button"
                                className="document-detail-info-edit-btn"
                                onClick={() => setSourceEditMode(true)}
                                title="Edit source"
                                aria-label="Edit source"
                              >
                                <Edit3 size={12} />
                              </button>
                            </span>
                          )}
                        </dd>
                      </div>
                      <div className="document-detail-info-item document-detail-info-item--compact">
                        <dt>Lifecycle</dt>
                        <dd>{article.lifecycle_status ?? '—'}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="document-detail-info-stats-col">
                    <dl className="document-detail-info-list document-detail-info-list--col">
                      <div className="document-detail-info-item document-detail-info-item--compact">
                        <dt>Applicable</dt>
                        <dd>{article.is_current_for_rag ? 'Yes' : 'No'}</dd>
                      </div>
                      <div className="document-detail-info-item document-detail-info-item--compact">
                        <dt>Updated</dt>
                        <dd>{new Date(article.updated_at).toLocaleString()}</dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <div className="document-detail-lineage document-detail-lineage--article">
                  <button
                    type="button"
                    className="document-detail-lineage-header"
                    onClick={() => setRelSectionOpen((o) => !o)}
                    aria-expanded={relSectionOpen}
                    aria-controls="article-relationships-panel"
                    id="article-relationships-heading"
                  >
                    <GitBranch size={16} aria-hidden />
                    <span>Relationships</span>
                    {relSectionOpen ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
                  </button>
                  {!relSectionOpen && (
                    <p className="document-detail-lineage-hint document-detail-muted">
                      Link this article to others (supersedes, amends, see also, …). Click to expand.
                    </p>
                  )}
                  {relSectionOpen && (
                    <div
                      id="article-relationships-panel"
                      className="document-detail-lineage-panel"
                      role="region"
                      aria-labelledby="article-relationships-heading"
                    >
                      <div className="document-detail-lineage-rel-block">
                        {lineageLoading ? (
                          <p className="document-detail-muted">Loading…</p>
                        ) : (
                          <>
                            <div className="document-detail-lineage-tables">
                              <div>
                                <div className="document-detail-lineage-dir">Outgoing (this → other)</div>
                                {lineageRels && lineageRels.outgoing.length > 0 ? (
                                  <table className="document-detail-lineage-table">
                                    <thead>
                                      <tr>
                                        <th>Type</th>
                                        <th>Other article</th>
                                        <th />
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {lineageRels.outgoing.map((r) => (
                                        <tr key={r.id}>
                                          <td>{r.relation_type}</td>
                                          <td>
                                            <Link to={`/articles/view/${r.peer_article_id}`}>
                                              {r.peer_article_name || r.peer_article_id}
                                            </Link>
                                          </td>
                                          <td>
                                            <button
                                              type="button"
                                              className="document-detail-lineage-rm"
                                              title="Remove"
                                              onClick={() => void handleDeleteRelationship(r.id)}
                                            >
                                              <Trash2 size={14} />
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : (
                                  <p className="document-detail-muted document-detail-lineage-empty">No outgoing links.</p>
                                )}
                              </div>
                              <div>
                                <div className="document-detail-lineage-dir">Incoming (other → this)</div>
                                {lineageRels && lineageRels.incoming.length > 0 ? (
                                  <table className="document-detail-lineage-table">
                                    <thead>
                                      <tr>
                                        <th>Type</th>
                                        <th>Other article</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {lineageRels.incoming.map((r) => (
                                        <tr key={r.id}>
                                          <td>{r.relation_type}</td>
                                          <td>
                                            <Link to={`/articles/view/${r.peer_article_id}`}>
                                              {r.peer_article_name || r.peer_article_id}
                                            </Link>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : (
                                  <p className="document-detail-muted document-detail-lineage-empty">No incoming links.</p>
                                )}
                              </div>
                            </div>
                            <div className="document-detail-lineage-add">
                              <span className="document-detail-lineage-dir">Add outgoing edge</span>
                              <div className="document-detail-lineage-add-row">
                                <select
                                  value={newRelType}
                                  onChange={(e) => setNewRelType(e.target.value)}
                                  className="document-detail-info-input"
                                  aria-label="Relation type"
                                >
                                  {ARTICLE_RELATION_TYPES.map((t) => (
                                    <option key={t} value={t}>
                                      {t}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  className="document-detail-info-input"
                                  placeholder="Target article ID"
                                  value={newRelTarget}
                                  onChange={(e) => setNewRelTarget(e.target.value)}
                                  aria-label="Target article ID"
                                />
                                <input
                                  type="text"
                                  className="document-detail-info-input"
                                  placeholder="Note (optional)"
                                  value={newRelNote}
                                  onChange={(e) => setNewRelNote(e.target.value)}
                                  aria-label="Note"
                                />
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => void handleAddRelationship()}
                                  disabled={relSaving}
                                >
                                  {relSaving ? <Loader2 size={12} className="doc-detail-spinner" /> : null}
                                  Add
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {attachments.length > 0 && (
                  <div className="document-detail-lineage document-detail-lineage--article">
                    <button
                      type="button"
                      className="document-detail-lineage-header"
                      onClick={() => setAttachmentsSectionOpen((o) => !o)}
                      aria-expanded={attachmentsSectionOpen}
                      aria-controls="article-attachments-panel"
                      id="article-attachments-heading"
                    >
                      <Paperclip size={16} aria-hidden />
                      <span className="article-detail-attachments-label">
                        Attachments
                        <span
                          className="document-detail-lineage-count"
                          aria-label={`${attachments.length} file${attachments.length === 1 ? '' : 's'}`}
                        >
                          {attachments.length}
                        </span>
                      </span>
                      {attachmentsSectionOpen ? (
                        <ChevronUp size={18} aria-hidden />
                      ) : (
                        <ChevronDown size={18} aria-hidden />
                      )}
                    </button>
                    {attachmentsSectionOpen && (
                      <div
                        id="article-attachments-panel"
                        className="document-detail-lineage-panel"
                        role="region"
                        aria-labelledby="article-attachments-heading"
                      >
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
                              <span className="document-detail-muted"> ({att.size_bytes} bytes)</span>
                              {markdownEditMode && (
                                <span className="article-detail-attachment-actions">
                                  <button
                                    type="button"
                                    className="article-detail-attachment-btn"
                                    onClick={() => insertAttachmentRef(att.storage_path, att.original_filename)}
                                    title="Insert link in markdown"
                                  >
                                    Insert link
                                  </button>
                                  <button
                                    type="button"
                                    className="article-detail-attachment-btn article-detail-attachment-btn--danger"
                                    onClick={() => void handleDeleteAttachment(att)}
                                    title="Remove attachment"
                                    aria-label="Remove attachment"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <div className="document-detail-metadata-actions article-detail-danger-zone">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm article-detail-delete-btn"
                    onClick={() => void handleDelete()}
                    disabled={deleting}
                  >
                    {deleting ? <Loader2 size={12} className="doc-detail-spinner" /> : <Trash2 size={14} />}
                    <span>{deleting ? 'Deleting…' : 'Delete article'}</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          <div className="document-detail-split article-detail-markdown-split">
            <section
              className={`document-detail-panel document-detail-markdown${markdownEditMode ? ' article-detail-markdown-panel--editing' : ''}`}
            >
              <h2 className="document-detail-panel-header">
                <FileText size={16} />
                <span>Markdown</span>
                <span className="article-detail-panel-header-spacer" />
                {markdownEditMode ? (
                  <>
                    <button
                      type="button"
                      className="document-detail-edit-toggle"
                      onClick={() => setMarkdownPreviewOpen((v) => !v)}
                      title={markdownPreviewOpen ? 'Hide preview' : 'Show preview on the right'}
                    >
                      {markdownPreviewOpen ? <EyeOff size={14} /> : <Eye size={14} />}
                      <span>{markdownPreviewOpen ? 'Hide preview' : 'Preview'}</span>
                    </button>
                    <button
                      type="button"
                      className="document-detail-edit-toggle"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={uploadingMedia}
                      title="Insert image"
                    >
                      {uploadingMedia ? <Loader2 size={14} className="doc-detail-spinner" /> : <ImageIcon size={14} />}
                      <span>Image</span>
                    </button>
                    <button
                      type="button"
                      className="document-detail-edit-toggle"
                      onClick={() => attachmentInputRef.current?.click()}
                      disabled={uploadingMedia}
                      title="Add attachment"
                    >
                      <Paperclip size={14} />
                      <span>Attachment</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary document-detail-save-btn"
                      onClick={() => void handleSaveMarkdown()}
                      disabled={savingMarkdown}
                      title="Save content"
                    >
                      {savingMarkdown ? <Loader2 size={14} className="doc-detail-spinner" /> : null}
                      <span>{savingMarkdown ? 'Saving…' : 'Save'}</span>
                    </button>
                    <button
                      type="button"
                      className="document-detail-edit-toggle"
                      onClick={handleCancelMarkdownEdit}
                      disabled={savingMarkdown}
                      title="Discard changes"
                    >
                      <XIcon size={14} />
                      <span>Cancel</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="document-detail-edit-toggle"
                    onClick={() => setMarkdownEditMode(true)}
                    title="Edit markdown"
                    aria-pressed={false}
                  >
                    <Edit3 size={14} />
                    <span>Edit</span>
                  </button>
                )}
              </h2>
              <div
                className={`document-detail-markdown-body${markdownEditMode ? ' article-detail-markdown-body--edit' : ''}`}
              >
                {markdownEditMode ? (
                  <div
                    ref={markdownSplitLayoutRef}
                    className={`article-detail-markdown-edit-layout${markdownPreviewOpen && id ? ' article-detail-markdown-edit-layout--split' : ''}`}
                    style={
                      markdownPreviewOpen && id
                        ? {
                            gridTemplateColumns: `${markdownSplitEditorFr}fr ${MARKDOWN_SPLIT_GUTTER_PX}px ${100 - markdownSplitEditorFr}fr`,
                          }
                        : undefined
                    }
                  >
                    <div
                      className={`article-detail-editor-dropzone article-detail-markdown-edit-editor${dragActive ? ' article-detail-editor-dropzone--active' : ''}`}
                      onDragOver={(e) => {
                        if (e.dataTransfer?.types?.includes('Files')) {
                          e.preventDefault();
                          setDragActive(true);
                        }
                      }}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        void handleEditorDrop(e as unknown as DragEvent<HTMLTextAreaElement>);
                      }}
                    >
                      <textarea
                        ref={textareaRef}
                        className="article-detail-markdown-textarea"
                        aria-label="Article body in Markdown"
                        placeholder="Write Markdown here. Paste or drop an image to upload, or use the toolbar."
                        value={editMarkdown}
                        onChange={(e) => setEditMarkdown(e.target.value)}
                        onPaste={(e) => void handleEditorPaste(e)}
                      />
                      {dragActive && (
                        <div className="article-detail-editor-dropzone-overlay" aria-hidden>
                          <Upload size={28} />
                          <span>Drop to upload — images embed inline, others become attachments</span>
                        </div>
                      )}
                      <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        style={{ display: 'none' }}
                        onChange={(e) => void handleImagePick(e)}
                      />
                      <input
                        ref={attachmentInputRef}
                        type="file"
                        multiple
                        style={{ display: 'none' }}
                        onChange={(e) => void handleAttachmentPick(e)}
                      />
                    </div>
                    {markdownPreviewOpen && id ? (
                      <>
                        <div
                          className="article-detail-markdown-splitter"
                          role="separator"
                          aria-orientation="vertical"
                          aria-label="Resize editor and preview"
                          onPointerDown={handleMarkdownSplitPointerDown}
                        />
                        <aside className="article-detail-markdown-preview-pane" aria-label="Markdown preview">
                          <div className="article-detail-markdown-preview-toolbar">
                            <span>Preview</span>
                            <button
                              type="button"
                              className="article-detail-markdown-preview-close"
                              onClick={() => setMarkdownPreviewOpen(false)}
                              title="Close preview"
                            >
                              <XIcon size={16} />
                              <span className="article-detail-markdown-preview-close-text">Close</span>
                            </button>
                          </div>
                          <div className="article-detail-markdown-preview-scroll article-detail-markdown-read">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm, remarkMath]}
                              rehypePlugins={[rehypeKatex]}
                              components={mdComponents}
                            >
                              {editMarkdown.trim() ? editMarkdown : ' '}
                            </ReactMarkdown>
                          </div>
                        </aside>
                      </>
                    ) : null}
                  </div>
                ) : editMarkdown.trim() ? (
                  <div className="article-detail-markdown-read">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={mdComponents}
                    >
                      {editMarkdown}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="document-detail-muted">No content yet. Choose Edit to add Markdown.</p>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
