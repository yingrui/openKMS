import { useCallback, useEffect, useMemo, useRef, useState, type AnchorHTMLAttributes, type ClipboardEvent, type DragEvent, type ImgHTMLAttributes } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  richMarkdownPreComponent,
} from '../../components/markdown/richMarkdown';
import { toast } from 'sonner';
import { useEnsureArticleChannels } from '../../contexts/ArticleChannelsContext';
import { getDocumentChannelName } from '../../data/channelUtils';
import {
  articleFileUrl,
  createArticleRelationship,
  deleteArticle,
  deleteArticleAttachment,
  deleteArticleRelationship,
  fetchArticle,
  fetchArticleAttachments,
  fetchArticleRelationships,
  fetchLatestArticleReview,
  runArticleReview,
  patchArticle,
  putArticleMarkdown,
  uploadArticleAttachment,
  uploadArticleImage,
  type ArticleAttachmentOut,
  type ArticleOut,
  type ArticleRelationshipsResponse,
  type ArticleReviewOut,
} from '../../data/articlesApi';
import { findChannel } from '../../data/channelUtils';
import { useDetailInfoVisible } from '../../hooks/useIsMobile';
import { useConfirm } from '../../contexts/ConfirmContext';

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

export function useArticleDetail() {
  const { t } = useTranslation('articles');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { channels } = useEnsureArticleChannels();
  const [infoVisible, setInfoVisible] = useDetailInfoVisible();
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
  const [reviewSectionOpen, setReviewSectionOpen] = useState(false);
  const [latestReview, setLatestReview] = useState<ArticleReviewOut | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewRunning, setReviewRunning] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const markdownSplitLayoutRef = useRef<HTMLDivElement | null>(null);
  const markdownSectionRef = useRef<HTMLElement | null>(null);

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
    setReviewSectionOpen(false);
    setLineageRels(null);
    setLatestReview(null);
  }, [id]);

  useEffect(() => {
    if (attachments.length > 0) {
      setAttachmentsSectionOpen(true);
    }
  }, [attachments.length]);

  /** Preview + edit: hide article info bar and bring the Markdown card to the top of the view for more editor/preview space */
  useEffect(() => {
    if (!markdownPreviewOpen || !markdownEditMode) return;
    setInfoVisible(false);
    const el = markdownSectionRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [markdownPreviewOpen, markdownEditMode]);

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

  const refreshLatestReview = useCallback(async () => {
    if (!id) return;
    setReviewLoading(true);
    try {
      const data = await fetchLatestArticleReview(id);
      setLatestReview(data);
    } catch {
      setLatestReview(null);
    } finally {
      setReviewLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    void refreshLatestReview();
  }, [id, refreshLatestReview]);

  const channelReviewConfigured = useMemo(() => {
    if (!article?.channel_id) return false;
    const ch = findChannel(channels, article.channel_id);
    return Boolean(ch?.review_model_id);
  }, [article?.channel_id, channels]);

  const handleRunReview = async () => {
    if (!id) return;
    setReviewRunning(true);
    try {
      const result = await runArticleReview(id);
      setLatestReview(result);
      toast.success(t('articleDetail.reviewDone'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('articleDetail.reviewFailed'));
    } finally {
      setReviewRunning(false);
    }
  };

  const mdComponents = useMemo(() => {
    const base = {
      pre: richMarkdownPreComponent(),
      ...(id
        ? {
            img: ({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) => (
              <img src={resolveMarkdownSrc(id, src)} alt={alt ?? ''} {...props} />
            ),
            a: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
              <a href={resolveMarkdownHref(id, href)} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            ),
          }
        : {}),
    };
    return base;
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
      if (
        !(await confirm({
          title: 'Remove attachment',
          message: `Remove attachment "${att.original_filename}"?`,
          confirmLabel: 'Remove',
          danger: true,
        }))
      )
        return;
      try {
        await deleteArticleAttachment(id, att.id);
        setAttachments((prev) => prev.filter((a) => a.id !== att.id));
        toast.success('Attachment removed');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Remove failed');
      }
    },
    [id, confirm],
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
    if (
      !(await confirm({
        title: 'Delete article',
        message: `Delete "${article.name}"? This cannot be undone.`,
        confirmLabel: 'Delete',
        danger: true,
      }))
    )
      return;
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

  return {
    t,
    id,
    article,
    attachments,
    error,
    backTo,
    channelLabel,
    infoVisible,
    setInfoVisible,
    editName,
    setEditName,
    editSourceRef,
    setEditSourceRef,
    editMarkdown,
    setEditMarkdown,
    titleEditMode,
    setTitleEditMode,
    sourceEditMode,
    setSourceEditMode,
    markdownEditMode,
    setMarkdownEditMode,
    markdownPreviewOpen,
    setMarkdownPreviewOpen,
    markdownSplitEditorFr,
    savingTitle,
    savingSource,
    savingMarkdown,
    deleting,
    relSectionOpen,
    setRelSectionOpen,
    lineageRels,
    lineageLoading,
    newRelTarget,
    setNewRelTarget,
    newRelType,
    setNewRelType,
    newRelNote,
    setNewRelNote,
    relSaving,
    attachmentsSectionOpen,
    setAttachmentsSectionOpen,
    reviewSectionOpen,
    setReviewSectionOpen,
    latestReview,
    reviewLoading,
    reviewRunning,
    channelReviewConfigured,
    uploadingMedia,
    dragActive,
    setDragActive,
    textareaRef,
    imageInputRef,
    attachmentInputRef,
    markdownSplitLayoutRef,
    markdownSectionRef,
    mdComponents,
    handleRunReview,
    handleSaveTitle,
    handleCancelTitleEdit,
    handleSaveSource,
    handleCancelSourceEdit,
    handleAddRelationship,
    handleDeleteRelationship,
    insertAttachmentRef,
    handleEditorPaste,
    handleEditorDrop,
    handleImagePick,
    handleAttachmentPick,
    handleDeleteAttachment,
    handleSaveMarkdown,
    handleCancelMarkdownEdit,
    handleMarkdownSplitPointerDown,
    handleDelete,
  };
}
