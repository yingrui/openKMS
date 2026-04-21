import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Bookmark, ChevronDown, ChevronRight, ChevronUp, Edit3, FileText, GitBranch, History, Image as ImageIcon, ListTree, Maximize2, Minimize2, Info, Play, Loader2, RefreshCw, RotateCcw, Sparkles, Trash2, X as XIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { AuthImage } from '../components/AuthImage';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { toast } from 'sonner';
import {
  createDocumentRelationship,
  createDocumentVersion,
  deleteDocumentRelationship,
  DOCUMENT_LIFECYCLE_STATUSES,
  DOCUMENT_RELATION_TYPES,
  extractDocumentMetadata,
  fetchDocumentById,
  fetchDocumentRelationships,
  fetchPageIndex,
  getDocumentFileUrl,
  getDocumentFilesBaseUrl,
  getDocumentVersion,
  listDocumentVersions,
  patchDocumentLifecycle,
  rebuildPageIndex,
  resetDocumentStatus,
  restoreDocumentMarkdown,
  restoreDocumentVersion,
  updateDocument,
  updateDocumentMetadata,
  updateDocumentMarkdown,
  type DocumentRelationshipsResponse,
  type DocumentResponse,
  type DocumentVersionDetail,
  type DocumentVersionListItem,
  type PageIndexNode,
} from '../data/documentsApi';
import { fetchObjectType, fetchObjectInstances } from '../data/ontologyApi';
import { createJob } from '../data/jobsApi';
import { useDocumentChannels } from '../contexts/DocumentChannelsContext';
import { findChannel, normalizeExtractionSchemaToFields } from '../data/channelUtils';
import './DocumentDetail.css';

interface ParsingResultItem {
  label: string;
  content: string;
  bbox?: number[];
  image_path?: string;
}

interface LayoutBox {
  coordinate?: number[];
  polygon_points?: number[][] | [number, number][];
  label?: string;
  block_index?: number;
}

interface LayoutDetItem {
  _images?: { res?: string };
  input_img?: string;
  boxes?: LayoutBox[];
}

interface ParsingResult {
  file_hash: string;
  parsing_res_list: ParsingResultItem[];
  layout_det_res?: LayoutDetItem[];
}

interface PageBlock {
  pageIndex: number;
  coordinate: number[];
  label: string;
  parsingItem: ParsingResultItem;
}

/** For each node, endLine = next sibling's startLine - 1 (or parent's end if last child).
 *  This makes parent content include all descendants. */
function buildNodeLineRanges(
  nodes: PageIndexNode[],
  parentEndLine: number | null = null
): Map<string | undefined, { startLine: number; endLine: number }> {
  const map = new Map<string | undefined, { startLine: number; endLine: number }>();
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const start = node.line_num ?? 1;
    const nextSibling = nodes[i + 1];
    const nextSiblingStart = nextSibling?.line_num ?? null;
    const end = nextSiblingStart != null ? nextSiblingStart - 1 : (parentEndLine ?? 999999);
    map.set(node.node_id, { startLine: start, endLine: end });
    if (node.nodes && node.nodes.length > 0) {
      const childMap = buildNodeLineRanges(node.nodes, end);
      childMap.forEach((v, k) => map.set(k, v));
    }
  }
  return map;
}

function PageIndexTreeNode({
  node,
  depth = 0,
  markdown,
  lineRangeMap,
  onContentClick,
}: {
  node: PageIndexNode;
  depth?: number;
  markdown: string | null;
  lineRangeMap: Map<string | undefined, { startLine: number; endLine: number }>;
  onContentClick: (content: string, node: PageIndexNode) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.nodes && node.nodes.length > 0;
  const lineRange = lineRangeMap.get(node.node_id);
  const handleContentClick = () => {
    if (!markdown || !lineRange) return;
    const lines = markdown.split('\n');
    const start = Math.max(0, lineRange.startLine - 1);
    const end = Math.min(lines.length, lineRange.endLine);
    const content = lines.slice(start, end).join('\n').trim();
    onContentClick(content, node);
  };
  return (
    <div className="document-detail-pageindex-node" style={{ marginLeft: depth * 12 }}>
      <div className="document-detail-pageindex-node-header">
        {hasChildren ? (
          <button
            type="button"
            className="document-detail-pageindex-expand"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="document-detail-pageindex-expand-placeholder" />
        )}
        <span className="document-detail-pageindex-node-title">{node.title}</span>
        {lineRange && (
          <button
            type="button"
            className="document-detail-pageindex-content-btn"
            onClick={handleContentClick}
            title="Show content"
            aria-label={`Show content of ${node.title}`}
          >
            <FileText size={14} />
          </button>
        )}
      </div>
      {hasChildren && expanded && (
        <div className="document-detail-pageindex-children">
          {node.nodes!.map((child, i) => (
            <PageIndexTreeNode
              key={child.node_id ?? i}
              node={child}
              depth={depth + 1}
              markdown={markdown}
              lineRangeMap={lineRangeMap}
              onContentClick={onContentClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PageIndexTree({
  pageIndex,
  loading,
  error,
  docConfig,
  markdown,
  markdownComponents,
}: {
  pageIndex: { structure: PageIndexNode[]; doc_name?: string | null } | null;
  loading: boolean;
  error: string | null;
  docConfig: { folderId: string; markdownFile: string } | null;
  markdown: string | null;
  markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'];
}) {
  const [contentPopover, setContentPopover] = useState<{ content: string; title: string } | null>(null);
  const lineRangeMap = useMemo(
    () => (pageIndex?.structure?.length ? buildNodeLineRanges(pageIndex.structure) : new Map()),
    [pageIndex?.structure]
  );
  const handleContentClick = useCallback((content: string, node: PageIndexNode) => {
    setContentPopover({ content, title: node.title });
  }, []);

  if (docConfig) {
    return <p className="document-detail-muted">Page Index not available for example documents.</p>;
  }
  if (loading) {
    return (
      <div className="document-detail-pageindex-loading">
        <Loader2 size={20} className="doc-detail-spinner" />
        <span>Loading page index…</span>
      </div>
    );
  }
  if (error) {
    return <p className="document-detail-muted document-detail-pageindex-error">{error}</p>;
  }
  if (!pageIndex || !pageIndex.structure?.length) {
    return (
      <p className="document-detail-muted">
        No page index available. Re-process the document to build the index.
      </p>
    );
  }
  return (
    <div className="document-detail-pageindex">
      {contentPopover && (
        <div
          className="document-detail-pageindex-dialog-overlay"
          onClick={() => setContentPopover(null)}
        >
          <div
            className="document-detail-pageindex-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pageindex-dialog-title"
          >
            <div className="document-detail-pageindex-dialog-header">
              <h2 id="pageindex-dialog-title">{contentPopover.title}</h2>
              <button
                type="button"
                className="document-detail-pageindex-dialog-close"
                onClick={() => setContentPopover(null)}
                aria-label="Close"
              >
                <XIcon size={18} />
              </button>
            </div>
            <div className="document-detail-pageindex-dialog-body">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeRaw, rehypeKatex]}
                components={markdownComponents}
              >
                {contentPopover.content || '_No content_'}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
      {pageIndex.structure.map((node, i) => (
        <PageIndexTreeNode
          key={node.node_id ?? i}
          node={node}
          markdown={markdown}
          lineRangeMap={lineRangeMap}
          onContentClick={handleContentClick}
        />
      ))}
    </div>
  );
}

// Map document id to example folder (folder hash + markdown filename)
const documentToFolder: Record<string, { folderId: string; markdownFile: string }> = {
  '1': {
    folderId: 'da4627b85a2d5dec05cc2dcad281a611a5c6f79bcb8fd1ecfa2f34f19b552871',
    markdownFile: 'tmpau_x_tty.md',
  },
  '2': {
    folderId: 'f3b3be345bf2df8979f2491ca9466e078e4fd1d6a216611faa8566e4c44d474b',
    markdownFile: 'tmpp2p37481.md',
  },
};

export function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const { channels } = useDocumentChannels();
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [parsingResult, setParsingResult] = useState<ParsingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extendedPanel, setExtendedPanel] = useState<'images' | 'markdown' | null>(null);
  const [hoveredBlockKey, setHoveredBlockKey] = useState<string | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<PageBlock | null>(null);
  const [pageDimensions, setPageDimensions] = useState<Record<number, { w: number; h: number }>>({});
  const [infoVisible, setInfoVisible] = useState(true);
  const [document, setDocument] = useState<DocumentResponse | null>(null);
  const [processing, setProcessing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [markdownEditMode, setMarkdownEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [infoEditMode, setInfoEditMode] = useState(false);
  const [metadataEditMode, setMetadataEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editMeta, setEditMeta] = useState<Record<string, unknown>>({});
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [extractWarnings, setExtractWarnings] = useState<string[]>([]);
  const [labelObjectTypes, setLabelObjectTypes] = useState<Record<string, { display_property?: string | null; key_property?: string | null }>>({});
  const [labelInstances, setLabelInstances] = useState<Record<string, { id: string; data: Record<string, unknown> }[]>>({});
  const [rightPanelView, setRightPanelView] = useState<'markdown' | 'pageIndex'>('markdown');
  const [pageIndex, setPageIndex] = useState<{ structure: PageIndexNode[]; doc_name?: string | null } | null>(null);
  const [pageIndexLoading, setPageIndexLoading] = useState(false);
  const [pageIndexError, setPageIndexError] = useState<string | null>(null);
  const [pageIndexRefreshKey, setPageIndexRefreshKey] = useState(0);
  const [pageIndexRebuilding, setPageIndexRebuilding] = useState(false);
  const [saveVersionModalOpen, setSaveVersionModalOpen] = useState(false);
  const [saveVersionTag, setSaveVersionTag] = useState('');
  const [saveVersionSubmitting, setSaveVersionSubmitting] = useState(false);
  const [versionsModalOpen, setVersionsModalOpen] = useState(false);
  const [versionsItems, setVersionsItems] = useState<DocumentVersionListItem[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionPreview, setVersionPreview] = useState<DocumentVersionDetail | null>(null);
  const [versionPreviewLoading, setVersionPreviewLoading] = useState(false);
  const [restoreModalVersion, setRestoreModalVersion] = useState<DocumentVersionListItem | null>(null);
  const [restoreSaveCurrent, setRestoreSaveCurrent] = useState(false);
  const [restoreLabel, setRestoreLabel] = useState('');
  const [restoreNote, setRestoreNote] = useState('');
  const [restoreSubmitting, setRestoreSubmitting] = useState(false);
  const [latestVersionSnapshot, setLatestVersionSnapshot] = useState<{
    created_at: string;
    version_number: number;
  } | null>(null);
  const [versionSnapshotLoading, setVersionSnapshotLoading] = useState(false);
  const [lineageRels, setLineageRels] = useState<DocumentRelationshipsResponse | null>(null);
  const [lineageLoading, setLineageLoading] = useState(false);
  const [lifecycleEdit, setLifecycleEdit] = useState(false);
  const [editSeriesId, setEditSeriesId] = useState('');
  const [editLifecycleStatus, setEditLifecycleStatus] = useState('');
  const [editEffectiveFrom, setEditEffectiveFrom] = useState('');
  const [editEffectiveTo, setEditEffectiveTo] = useState('');
  const [lifecycleSaving, setLifecycleSaving] = useState(false);
  const [newRelTarget, setNewRelTarget] = useState('');
  const [newRelType, setNewRelType] = useState<string>('supersedes');
  const [newRelNote, setNewRelNote] = useState('');
  const [relSaving, setRelSaving] = useState(false);
  const [lineageSectionOpen, setLineageSectionOpen] = useState(false);

  const docConfig = id ? documentToFolder[id] : null;
  const folderId = docConfig?.folderId ?? null;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const controller = new AbortController();
    const signal = controller.signal;

    const load = () => {
      if (docConfig) {
        const baseUrl = `/examples/${docConfig.folderId}`;
        const markdownUrl = `${baseUrl}/markdown_out/${docConfig.markdownFile}`;
        Promise.all([
          fetch(`${baseUrl}/result.json`, { signal }).then((r) => (r.ok ? r.json() : null)),
          fetch(markdownUrl, { signal }).then((r) => (r.ok ? r.text() : null)),
        ])
          .then(([result, md]) => {
            if (!cancelled) {
              setParsingResult(result);
              setMarkdown(md);
              setDocument({
                id: id!,
                name: docConfig!.markdownFile,
                file_type: 'MD',
                size_bytes: 0,
                channel_id: '',
                series_id: id!,
                created_at: '',
                updated_at: '',
              });
            }
          })
          .catch((e) => {
            if (!cancelled && e?.name !== 'AbortError') setError('Failed to load document content');
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      } else {
        fetchDocumentById(id, signal)
          .then((doc) => {
            if (!cancelled && doc) {
              setDocument(doc);
              setParsingResult((doc.parsing_result ?? null) as ParsingResult | null);
              setMarkdown(doc.markdown ?? '');
            }
          })
          .catch((e) => {
            if (!cancelled && e?.name !== 'AbortError') setError(e instanceof Error ? e.message : 'Failed to load document');
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      }
    };

    const timeoutId = setTimeout(load, 0);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [id, docConfig]);

  useEffect(() => {
    if (!id || rightPanelView !== 'pageIndex' || docConfig) {
      if (!id || docConfig) setPageIndex(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setPageIndexError(null);
    setPageIndexLoading(true);
    fetchPageIndex(id, controller.signal)
      .then((data) => {
        if (!cancelled) setPageIndex(data);
      })
      .catch((e) => {
        if (!cancelled && e?.name !== 'AbortError') {
          setPageIndexError(e instanceof Error ? e.message : 'Failed to load page index');
          setPageIndex(null);
        }
      })
      .finally(() => {
        if (!cancelled) setPageIndexLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, rightPanelView, docConfig, pageIndexRefreshKey]);

  /** Images: examples use /examples/, backend docs use proxy. */
  const getImageUrl = (path: string) => (id ? getDocumentFileUrl(id, path) : '');

  const fileHash = parsingResult?.file_hash ?? document?.file_hash ?? '';
  const markdownBaseUrl = folderId
    ? `/examples/${folderId}/markdown_out`
    : (id && fileHash
        ? `${getDocumentFilesBaseUrl(id)}/${encodeURIComponent(fileHash)}/markdown_out`
        : '');

  /** Memoized to avoid remounting img elements on every re-render (which cancels in-flight requests). */
  const markdownComponents = useMemo(
    () => ({
      img: ({ src, ...props }: { src?: string }) => {
        const resolved = src?.startsWith('/') ? src : `${markdownBaseUrl}/${src}`;
        return <AuthImage src={resolved ?? ''} loading="lazy" {...props} />;
      },
    }),
    [markdownBaseUrl]
  );

  // Build page blocks: for each layout box, find parsing item by matching coordinates
  const pageBlocks = (() => {
    if (!parsingResult?.layout_det_res || !parsingResult.parsing_res_list) return [];
    const list: PageBlock[] = [];
    const parsingList = parsingResult.parsing_res_list;

    const coordMatch = (a: number[], b: number[], tol = 2) =>
      a.length >= 4 && b.length >= 4 &&
      Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol &&
      Math.abs(a[2] - b[2]) <= tol && Math.abs(a[3] - b[3]) <= tol;

    const layout = parsingResult.layout_det_res;
    for (let pi = 0; pi < layout.length; pi++) {
      const item = layout[pi];
      const boxes = item?.boxes ?? [];
      for (let bi = 0; bi < boxes.length; bi++) {
        const box = boxes[bi];
        let coordFlat: number[] | null = null;
        if (Array.isArray(box?.coordinate) && box.coordinate.length >= 4) {
          coordFlat = box.coordinate.slice(0, 4);
        } else if (Array.isArray(box?.polygon_points) && box.polygon_points.length >= 2) {
          const pts = box.polygon_points.flat() as number[];
          const xs = pts.filter((_, i) => i % 2 === 0), ys = pts.filter((_, i) => i % 2 === 1);
          if (xs.length && ys.length) coordFlat = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
        }
        if (!coordFlat) continue;

        const parsingIdx = parsingList.findIndex((p) => {
          const bbox = p.bbox;
          return Array.isArray(bbox) && coordMatch(coordFlat!, bbox as number[]);
        });
        const parsingItem = parsingIdx >= 0 ? parsingList[parsingIdx] : undefined;
        list.push({
          pageIndex: pi,
          coordinate: coordFlat,
          label: box?.label ?? parsingItem?.label ?? 'block',
          parsingItem: parsingItem ?? { label: 'unknown', content: '' },
        });
      }
    }
    return list;
  })();

  const onPageImageLoad = useCallback((pageIndex: number, img: HTMLImageElement) => {
    if (img?.naturalWidth && img?.naturalHeight) {
      setPageDimensions((p) => ({ ...p, [pageIndex]: { w: img.naturalWidth, h: img.naturalHeight } }));
    }
  }, []);

  const channel = document?.channel_id ? findChannel(channels, document.channel_id) : null;
  const hasExtractionModel = !!channel?.extraction_model_id;
  const extractionSchemaFields = normalizeExtractionSchemaToFields(channel?.extraction_schema ?? null);
  const labelConfig = (channel?.label_config ?? []).filter(
    (l: { key?: string; object_type_id?: string }) => l.key && l.object_type_id
  );
  const meta = document?.metadata ?? {};
  const extractionKeys = extractionSchemaFields.map((f) => f.key);
  const labelKeys = labelConfig.map((l: { key: string }) => l.key);
  const metaKeys = extractionKeys.length > 0 || labelKeys.length > 0
    ? [...extractionKeys, ...labelKeys.filter((k) => !extractionKeys.includes(k))]
    : Object.keys(meta).filter((k) => !['extracted_at', 'extraction_model_id'].includes(k));
  const showMetadataSection = !docConfig && document?.channel_id;
  const labelKeysSet = new Set(labelKeys);

  const extractionObjectTypeIds = extractionSchemaFields
    .filter((f) => (f.type === 'object_type' || f.type === 'list[object_type]') && (f as { object_type_id?: string }).object_type_id)
    .map((f) => (f as { object_type_id: string }).object_type_id);
  const allObjectTypeIds = [...new Set([...labelConfig.map((l: { object_type_id: string }) => l.object_type_id), ...extractionObjectTypeIds])];

  useEffect(() => {
    if (allObjectTypeIds.length === 0) return;
    let cancelled = false;
    const load = async () => {
      const uniqueIds = allObjectTypeIds;
      try {
        const [typesRes, instancesRes] = await Promise.all([
          Promise.all(uniqueIds.map((otid) => fetchObjectType(otid))),
          Promise.all(uniqueIds.map((otid) => fetchObjectInstances(otid))),
        ]);
        if (cancelled) return;
        const typesMap: Record<string, { display_property?: string | null; key_property?: string | null }> = {};
        const instancesMap: Record<string, { id: string; data: Record<string, unknown> }[]> = {};
        uniqueIds.forEach((otid, i) => {
          typesMap[otid] = {
            display_property: typesRes[i]?.display_property ?? null,
            key_property: typesRes[i]?.key_property ?? null,
          };
          instancesMap[otid] = (instancesRes[i]?.items ?? []).map((x) => ({ id: x.id, data: x.data ?? {} }));
        });
        setLabelObjectTypes(typesMap);
        setLabelInstances(instancesMap);
      } catch {
        if (!cancelled) {
          setLabelObjectTypes({});
          setLabelInstances({});
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [channel?.id, JSON.stringify(allObjectTypeIds)]);

  const getInstanceDisplay = (otid: string, instance: { id: string; data: Record<string, unknown> }) => {
    const ot = labelObjectTypes[otid];
    const displayProp = ot?.display_property ?? ot?.key_property;
    if (displayProp && instance.data[displayProp] != null) {
      return String(instance.data[displayProp]);
    }
    const keys = Object.keys(instance.data).filter((k) => k !== 'id');
    if (keys.length > 0 && instance.data[keys[0]] != null) return String(instance.data[keys[0]]);
    return instance.id;
  };

  const handleProcess = useCallback(async () => {
    if (!id || !document) return;
    setProcessing(true);
    try {
      await createJob({ document_id: id });
      toast.success('Processing job created');
      const updated = await fetchDocumentById(id);
      setDocument(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create processing job');
    } finally {
      setProcessing(false);
    }
  }, [id, document]);

  const handleReset = useCallback(async () => {
    if (!id || !document) return;
    setResetting(true);
    try {
      const updated = await resetDocumentStatus(id);
      setDocument(updated);
      toast.success('Document status reset to uploaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reset status');
    } finally {
      setResetting(false);
    }
  }, [id, document]);

  const handleExtract = useCallback(async () => {
    if (!id || !document) return;
    setExtracting(true);
    setExtractWarnings([]);
    try {
      const result = await extractDocumentMetadata(id);
      setDocument(result.document);
      setExtractWarnings(result.warnings ?? []);
      toast.success('Metadata extracted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Extraction failed');
    } finally {
      setExtracting(false);
    }
  }, [id, document]);

  const handleSaveMarkdown = useCallback(async () => {
    if (!id || markdown === null) return;
    setSaving(true);
    try {
      const updated = await updateDocumentMarkdown(id, markdown);
      setDocument(updated);
      setMarkdown(updated.markdown ?? '');
      setMarkdownEditMode(false);
      setPageIndexRefreshKey((k) => k + 1);
      toast.success('Markdown saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save markdown');
    } finally {
      setSaving(false);
    }
  }, [id, markdown]);

  const handleRestoreMarkdown = useCallback(async () => {
    if (!id) return;
    if (!window.confirm('Restore from original? Unsaved edits will be lost.')) return;
    setRestoring(true);
    try {
      const updated = await restoreDocumentMarkdown(id);
      setDocument(updated);
      setMarkdown(updated.markdown ?? '');
      setMarkdownEditMode(false);
      setPageIndexRefreshKey((k) => k + 1);
      toast.success('Markdown restored from storage');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setRestoring(false);
    }
  }, [id]);

  const handleRebuildPageIndex = useCallback(async () => {
    if (!id) return;
    setPageIndexRebuilding(true);
    try {
      const data = await rebuildPageIndex(id);
      setPageIndex(data);
      setPageIndexError(null);
      toast.success('Page index updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to rebuild page index');
    } finally {
      setPageIndexRebuilding(false);
    }
  }, [id]);

  const handleEnterInfoEdit = useCallback(() => {
    setEditName(document?.name ?? '');
    setInfoEditMode(true);
  }, [document?.name]);

  const handleSaveInfo = useCallback(async () => {
    if (!id || !document) return;
    if (editName.trim() === document.name) {
      setInfoEditMode(false);
      return;
    }
    setSavingInfo(true);
    try {
      const updated = await updateDocument(id, { name: editName.trim() });
      setDocument(updated);
      setInfoEditMode(false);
      toast.success('Document info saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSavingInfo(false);
    }
  }, [id, document, editName]);

  const handleCancelInfoEdit = useCallback(() => {
    setInfoEditMode(false);
  }, []);

  const handleEnterMetadataEdit = useCallback(() => {
    const meta = document?.metadata ?? {};
    const keys = metaKeys;
    const initial: Record<string, unknown> = {};
    for (const key of keys) {
      initial[key] = meta[key] ?? '';
    }
    setEditMeta(initial);
    setMetadataEditMode(true);
  }, [document?.metadata, metaKeys]);

  const handleSaveMetadata = useCallback(async () => {
    if (!id) return;
    setSavingMetadata(true);
    try {
      const updated = await updateDocumentMetadata(id, editMeta);
      setDocument(updated);
      setMetadataEditMode(false);
      toast.success('Metadata saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save metadata');
    } finally {
      setSavingMetadata(false);
    }
  }, [id, editMeta]);

  const handleCancelMetadataEdit = useCallback(() => {
    setMetadataEditMode(false);
  }, []);

  const refreshLatestVersionSnapshot = useCallback(async () => {
    if (!id || docConfig) return;
    setVersionSnapshotLoading(true);
    try {
      const { items } = await listDocumentVersions(id);
      if (!items.length) {
        setLatestVersionSnapshot(null);
      } else {
        setLatestVersionSnapshot({
          created_at: items[0].created_at,
          version_number: items[0].version_number,
        });
      }
    } catch {
      setLatestVersionSnapshot(null);
    } finally {
      setVersionSnapshotLoading(false);
    }
  }, [id, docConfig]);

  useEffect(() => {
    if (!id || docConfig) {
      setLatestVersionSnapshot(null);
      setVersionSnapshotLoading(false);
      return;
    }
    refreshLatestVersionSnapshot();
  }, [id, docConfig, refreshLatestVersionSnapshot]);

  const refreshLineage = useCallback(async () => {
    if (!id || docConfig) return;
    setLineageLoading(true);
    try {
      const data = await fetchDocumentRelationships(id);
      setLineageRels(data);
    } catch {
      setLineageRels(null);
    } finally {
      setLineageLoading(false);
    }
  }, [id, docConfig]);

  useEffect(() => {
    setLineageSectionOpen(false);
  }, [id]);

  useEffect(() => {
    if (!lineageSectionOpen || !id || docConfig) return;
    void refreshLineage();
  }, [lineageSectionOpen, id, docConfig, refreshLineage]);

  useEffect(() => {
    if (!lifecycleEdit || !document) return;
    setEditSeriesId(document.series_id ?? document.id);
    setEditLifecycleStatus(document.lifecycle_status ?? '');
    const toLocal = (iso: string | null | undefined) => {
      if (!iso) return '';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    setEditEffectiveFrom(toLocal(document.effective_from ?? null));
    setEditEffectiveTo(toLocal(document.effective_to ?? null));
  }, [lifecycleEdit, document]);

  const handleSaveLifecycle = useCallback(async () => {
    if (!id) return;
    setLifecycleSaving(true);
    try {
      const updated = await patchDocumentLifecycle(id, {
        series_id: editSeriesId.trim() || undefined,
        lifecycle_status: editLifecycleStatus || null,
        effective_from: editEffectiveFrom ? new Date(editEffectiveFrom).toISOString() : null,
        effective_to: editEffectiveTo ? new Date(editEffectiveTo).toISOString() : null,
      });
      setDocument(updated);
      setLifecycleEdit(false);
      toast.success('Lifecycle saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setLifecycleSaving(false);
    }
  }, [id, editSeriesId, editLifecycleStatus, editEffectiveFrom, editEffectiveTo]);

  const handleAddRelationship = useCallback(async () => {
    if (!id || !newRelTarget.trim()) {
      toast.error('Target document ID required');
      return;
    }
    setRelSaving(true);
    try {
      await createDocumentRelationship(id, {
        target_document_id: newRelTarget.trim(),
        relation_type: newRelType,
        note: newRelNote.trim() || null,
      });
      setNewRelTarget('');
      setNewRelNote('');
      await refreshLineage();
      toast.success('Relationship added');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add');
    } finally {
      setRelSaving(false);
    }
  }, [id, newRelTarget, newRelType, newRelNote, refreshLineage]);

  const handleDeleteRelationship = useCallback(
    async (relationshipId: string) => {
      if (!id) return;
      try {
        await deleteDocumentRelationship(id, relationshipId);
        await refreshLineage();
        toast.success('Removed');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to remove');
      }
    },
    [id, refreshLineage]
  );

  const showSaveVersionButton = useMemo(() => {
    if (docConfig || !document || versionSnapshotLoading) return false;
    if (!latestVersionSnapshot) return true;
    return new Date(document.updated_at).getTime() > new Date(latestVersionSnapshot.created_at).getTime();
  }, [docConfig, document, versionSnapshotLoading, latestVersionSnapshot]);

  const handleOpenVersionsModal = useCallback(async () => {
    if (!id) return;
    setVersionsModalOpen(true);
    setVersionsLoading(true);
    try {
      const { items } = await listDocumentVersions(id);
      setVersionsItems(items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load versions');
      setVersionsItems([]);
    } finally {
      setVersionsLoading(false);
    }
  }, [id]);

  const handleCreateVersion = useCallback(async () => {
    if (!id) return;
    setSaveVersionSubmitting(true);
    try {
      const created = await createDocumentVersion(id, {
        tag: saveVersionTag.trim() || null,
        note: null,
      });
      setLatestVersionSnapshot({
        created_at: created.created_at,
        version_number: created.version_number,
      });
      toast.success('Version saved');
      setSaveVersionModalOpen(false);
      setSaveVersionTag('');
      if (versionsModalOpen) {
        const { items } = await listDocumentVersions(id);
        setVersionsItems(items);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save version');
    } finally {
      setSaveVersionSubmitting(false);
    }
  }, [id, saveVersionTag, versionsModalOpen]);

  const handlePreviewVersion = useCallback(async (vid: string) => {
    if (!id) return;
    setVersionPreviewLoading(true);
    setVersionPreview(null);
    try {
      const detail = await getDocumentVersion(id, vid);
      setVersionPreview(detail);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load version');
    } finally {
      setVersionPreviewLoading(false);
    }
  }, [id]);

  const handleConfirmRestore = useCallback(async () => {
    if (!id || !restoreModalVersion) return;
    setRestoreSubmitting(true);
    try {
      const updated = await restoreDocumentVersion(id, restoreModalVersion.id, {
        save_current_as_version: restoreSaveCurrent,
        tag: restoreLabel.trim() || null,
        note: restoreNote.trim() || null,
      });
      setDocument(updated);
      setMarkdown(updated.markdown ?? '');
      const m = updated.metadata ?? {};
      const initial: Record<string, unknown> = {};
      for (const key of metaKeys) {
        initial[key] = m[key] ?? '';
      }
      setEditMeta(initial);
      setMetadataEditMode(false);
      setMarkdownEditMode(false);
      setPageIndexRefreshKey((k) => k + 1);
      setRestoreModalVersion(null);
      setRestoreSaveCurrent(false);
      setRestoreLabel('');
      setRestoreNote('');
      toast.success('Version restored');
      if (versionsModalOpen) {
        const { items } = await listDocumentVersions(id);
        setVersionsItems(items);
      }
      await refreshLatestVersionSnapshot();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setRestoreSubmitting(false);
    }
  }, [id, restoreModalVersion, restoreSaveCurrent, restoreLabel, restoreNote, versionsModalOpen, metaKeys, refreshLatestVersionSnapshot]);

  const setEditMetaField = useCallback((key: string, value: unknown) => {
    setEditMeta((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handlePageMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, pageIndex: number) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const dims = pageDimensions[pageIndex];
      if (!dims) return;
      const x = ((e.clientX - rect.left) / rect.width) * dims.w;
      const y = ((e.clientY - rect.top) / rect.height) * dims.h;
      const blocks = pageBlocks.filter((b) => b.pageIndex === pageIndex);
      const idx = blocks.findIndex((b) => {
        const [x1, y1, x2, y2] = b.coordinate;
        return x >= x1 && x <= x2 && y >= y1 && y <= y2;
      });
      setHoveredBlockKey(idx >= 0 ? `${pageIndex}-${idx}` : null);
    },
    [pageDimensions, pageBlocks]
  );

  return (
    <div className="document-detail">
      <Link to={document?.channel_id ? `/documents/channels/${document.channel_id}` : '/documents'} className="document-detail-back">
        <ArrowLeft size={18} />
        <span>Back to Documents</span>
      </Link>
      {loading ? (
        <div className="document-detail-loading">Loading...</div>
      ) : (
        <>
          {document && !extendedPanel && (
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
                <span>Document Information{showMetadataSection ? ' & Metadata' : ''}</span>
                <button
                  type="button"
                  className="document-detail-info-toggle-btn"
                  onClick={(e) => { e.stopPropagation(); setInfoVisible((v) => !v); }}
                  aria-label={infoVisible ? 'Hide' : 'Show'}
                >
                  {infoVisible ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </h2>
              {infoVisible && (
                <div className="document-detail-info-body">
                  <dl className="document-detail-info-list document-detail-info-list--name-row">
                    <div className="document-detail-info-item document-detail-info-item--name">
                      <dt>Name</dt>
                      <dd>
                        {infoEditMode && !docConfig ? (
                          <div className="document-detail-info-edit-row">
                            <input
                              type="text"
                              className="document-detail-info-input"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              aria-label="Document name"
                            />
                            <div className="document-detail-info-edit-actions">
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={handleSaveInfo}
                                disabled={savingInfo || !editName.trim()}
                              >
                                {savingInfo ? <Loader2 size={12} className="doc-detail-spinner" /> : null}
                                <span>{savingInfo ? 'Saving…' : 'Save'}</span>
                              </button>
                              <button
                                type="button"
                                className="document-detail-info-cancel-btn"
                                onClick={handleCancelInfoEdit}
                                disabled={savingInfo}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="document-detail-info-value">
                            {document.name}
                            {!docConfig && (
                              <button
                                type="button"
                                className="document-detail-info-edit-btn"
                                onClick={handleEnterInfoEdit}
                                title="Edit document info"
                                aria-label="Edit"
                              >
                                <Edit3 size={12} />
                              </button>
                            )}
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>
                  <div className="document-detail-info-stats-grid">
                    <div className="document-detail-info-stats-col">
                      <dl className="document-detail-info-list document-detail-info-list--col">
                        <div className="document-detail-info-item document-detail-info-item--compact">
                          <dt>Type</dt>
                          <dd>{document.file_type}</dd>
                        </div>
                        <div className="document-detail-info-item document-detail-info-item--compact">
                          <dt>Size</dt>
                          <dd>{document.size_bytes ? `${(document.size_bytes / 1024).toFixed(1)} KB` : '—'}</dd>
                        </div>
                        <div className="document-detail-info-item document-detail-info-item--compact">
                          <dt>Uploaded</dt>
                          <dd>{document.created_at ? new Date(document.created_at).toLocaleString() : '—'}</dd>
                        </div>
                      </dl>
                    </div>
                    <div className="document-detail-info-stats-col">
                      <dl className="document-detail-info-list document-detail-info-list--col">
                        <div className="document-detail-info-item document-detail-info-item--compact">
                          <dt>Status</dt>
                          <dd>
                            <span className={`doc-status doc-status-${document.status || 'completed'}`}>
                              {document.status || 'completed'}
                            </span>
                            {(document.status === 'uploaded' || document.status === 'failed') && (
                              <button
                                type="button"
                                className="document-detail-process-btn"
                                onClick={handleProcess}
                                disabled={processing}
                                title="Process this document"
                              >
                                {processing ? <Loader2 size={14} className="doc-detail-spinner" /> : <Play size={14} />}
                                <span>{processing ? 'Processing…' : 'Process'}</span>
                              </button>
                            )}
                            {(document.status === 'pending' || document.status === 'failed') && (
                              <button
                                type="button"
                                className="document-detail-reset-btn"
                                onClick={handleReset}
                                disabled={resetting}
                                title="Reset status to uploaded"
                              >
                                {resetting ? <Loader2 size={14} className="doc-detail-spinner" /> : <RotateCcw size={14} />}
                                <span>{resetting ? 'Resetting…' : 'Reset'}</span>
                              </button>
                            )}
                          </dd>
                        </div>
                        <div className="document-detail-info-item document-detail-info-item--compact">
                          <dt>Markdown</dt>
                          <dd>{markdown ? 'Yes' : 'No'}</dd>
                        </div>
                        {fileHash ? (
                          <div className="document-detail-info-item document-detail-info-item--compact">
                            <dt>File hash</dt>
                            <dd className="document-detail-info-hash" title={fileHash}>
                              {fileHash.length > 12 ? `${fileHash.slice(0, 10)}...` : fileHash}
                            </dd>
                          </div>
                        ) : (
                          <div className="document-detail-info-item document-detail-info-item--compact">
                            <dt>File hash</dt>
                            <dd>—</dd>
                          </div>
                        )}
                      </dl>
                    </div>
                    <div className="document-detail-info-stats-col document-detail-info-stats-col--version">
                      <div className="document-detail-version-panel">
                        <div className="document-detail-version-panel-label">Version</div>
                        <div className="document-detail-version-panel-body">
                          <div className="document-detail-version-panel-status">
                            {docConfig ? (
                              '—'
                            ) : versionSnapshotLoading ? (
                              <span className="document-detail-muted">Loading…</span>
                            ) : latestVersionSnapshot ? (
                              <span className="document-detail-info-version-text">
                                v{latestVersionSnapshot.version_number}
                                <span className="document-detail-info-version-sep"> · </span>
                                {new Date(latestVersionSnapshot.created_at).toLocaleString()}
                              </span>
                            ) : (
                              <span
                                className="document-detail-muted"
                                title="Markdown can exist without a named version. Save version stores a checkpoint of the current markdown and metadata."
                              >
                                No version saved yet
                              </span>
                            )}
                          </div>
                          {!docConfig && (
                            <div className="document-detail-version-panel-actions">
                              <button
                                type="button"
                                className="document-detail-version-panel-btn document-detail-version-panel-btn--ghost"
                                onClick={handleOpenVersionsModal}
                                title="View and restore document versions"
                              >
                                <History size={14} />
                                <span>Versions</span>
                              </button>
                              {showSaveVersionButton && (
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm document-detail-version-panel-btn--primary"
                                  onClick={() => {
                                    setSaveVersionTag('');
                                    setSaveVersionModalOpen(true);
                                  }}
                                  title="Save current markdown and metadata as a named version"
                                >
                                  <Bookmark size={14} />
                                  <span>Save version</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  {showMetadataSection && (
                    <>
                      <hr className="document-detail-info-divider" />
                      <div className="document-detail-metadata-body">
                        <h3 className="document-detail-metadata-subtitle">
                          <Sparkles size={16} />
                          METADATA
                          {(metaKeys.length > 0 || extractionSchemaFields.length > 0 || labelConfig.length > 0) && !metadataEditMode ? (
                            <button
                              type="button"
                              className="document-detail-metadata-edit-btn"
                              onClick={handleEnterMetadataEdit}
                              title="Edit metadata"
                              aria-label="Edit metadata"
                            >
                              <Edit3 size={12} />
                              <span>Edit</span>
                            </button>
                          ) : null}
                        </h3>
                        {metaKeys.length === 0 && !metadataEditMode ? (
                          <p className="document-detail-metadata-empty">
                            No metadata yet. Click Extract to use LLM, or configure Manual Labels in channel settings.
                            {!hasExtractionModel && ' (Configure an extraction model in channel settings.)'}
                          </p>
                        ) : metadataEditMode ? (
                          <div className="document-detail-metadata-edit">
                            <dl className="document-detail-info-list document-detail-metadata-list">
                              {metaKeys.map((key) => {
                                const field = extractionSchemaFields.find((f) => f.key === key);
                                const lc = labelConfig.find((l: { key: string }) => l.key === key);
                                const label = field?.label ?? lc?.display_label ?? lc?.key ?? key;
                                const fieldType = field?.type ?? (lc ? (lc.type === 'list[object_type]' ? 'list[object_type]' : 'object_type') : 'string');
                                const val = editMeta[key];
                                const strVal = val == null ? '' : Array.isArray(val) ? (val as unknown[]).join(', ') : String(val);
                                return (
                                  <div key={key} className="document-detail-info-item document-detail-info-item--edit">
                                    <dt>{label}</dt>
                                    <dd>
                                      {fieldType === 'date' ? (
                                        <input
                                          type="date"
                                          className="document-detail-metadata-input"
                                          value={typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val) ? (val as string).slice(0, 10) : ''}
                                          onChange={(e) => setEditMetaField(key, e.target.value || null)}
                                          aria-label={label}
                                        />
                                      ) : fieldType === 'array' ? (
                                        <input
                                          type="text"
                                          className="document-detail-metadata-input"
                                          value={Array.isArray(val) ? (val as unknown[]).join(', ') : (val ? String(val) : '')}
                                          onChange={(e) => {
                                            const s = e.target.value.trim();
                                            setEditMetaField(key, s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);
                                          }}
                                          placeholder="Comma-separated values"
                                          aria-label={label}
                                        />
                                      ) : fieldType === 'enum' && field?.enum && field.enum.length > 0 ? (
                                        <select
                                          className="document-detail-metadata-input"
                                          value={val != null ? String(val) : ''}
                                          onChange={(e) => setEditMetaField(key, e.target.value || null)}
                                          aria-label={label}
                                        >
                                          <option value="">—</option>
                                          {field.enum.map((opt) => (
                                            <option key={opt} value={opt}>
                                              {opt}
                                            </option>
                                          ))}
                                        </select>
                                      ) : fieldType === 'integer' ? (
                                        <input
                                          type="number"
                                          step={1}
                                          className="document-detail-metadata-input"
                                          value={val == null || val === '' ? '' : (typeof val === 'number' ? val : parseInt(String(val), 10) || '')}
                                          onChange={(e) => {
                                            const s = e.target.value;
                                            const n = parseInt(s, 10);
                                            setEditMetaField(key, s === '' || Number.isNaN(n) ? null : n);
                                          }}
                                          placeholder="Integer"
                                          aria-label={label}
                                        />
                                      ) : fieldType === 'number' ? (
                                        <input
                                          type="number"
                                          step="any"
                                          className="document-detail-metadata-input"
                                          value={val == null || val === '' ? '' : (typeof val === 'number' ? val : parseFloat(String(val)) ?? '')}
                                          onChange={(e) => {
                                            const s = e.target.value;
                                            const n = parseFloat(s);
                                            setEditMetaField(key, s === '' || Number.isNaN(n) ? null : n);
                                          }}
                                          placeholder="Number"
                                          aria-label={label}
                                        />
                                      ) : fieldType === 'boolean' ? (
                                        <select
                                          className="document-detail-metadata-input"
                                          value={val === true ? 'true' : val === false ? 'false' : ''}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setEditMetaField(key, v === '' ? null : v === 'true');
                                          }}
                                          aria-label={label}
                                        >
                                          <option value="">—</option>
                                          <option value="true">true</option>
                                          <option value="false">false</option>
                                        </select>
                                      ) : fieldType === 'object_type' || fieldType === 'list[object_type]' ? (
                                        (() => {
                                          const otid = (field as { object_type_id?: string })?.object_type_id ?? lc?.object_type_id ?? '';
                                          const instances = labelInstances[otid] ?? [];
                                          const currentVal = val;
                                          const isMulti = fieldType === 'list[object_type]';
                                          return isMulti ? (
                                            <div className="document-detail-labels-multi">
                                              <select
                                                className="document-detail-metadata-input"
                                                value=""
                                                onChange={(e) => {
                                                  const pk = e.target.value;
                                                  if (!pk) return;
                                                  const arr = Array.isArray(currentVal) ? [...currentVal] : currentVal ? [currentVal] : [];
                                                  if (!arr.includes(pk)) {
                                                    setEditMetaField(key, [...arr, pk]);
                                                  }
                                                  e.target.value = '';
                                                }}
                                                aria-label={`Add ${label}`}
                                              >
                                                <option value="">— Add —</option>
                                                {instances.map((inst) => (
                                                  <option key={inst.id} value={inst.id}>
                                                    {getInstanceDisplay(otid, inst)}
                                                  </option>
                                                ))}
                                              </select>
                                              <div className="document-detail-labels-pills">
                                                {(Array.isArray(currentVal) ? currentVal : currentVal ? [currentVal] : []).map((pk: string) => {
                                                  const inst = instances.find((i) => i.id === pk);
                                                  const display = inst ? getInstanceDisplay(otid, inst) : pk;
                                                  return (
                                                    <span key={pk} className="document-detail-metadata-pill document-detail-labels-pill">
                                                      {display}
                                                      <button
                                                        type="button"
                                                        onClick={() => {
                                                          const arr = Array.isArray(currentVal) ? currentVal.filter((x: string) => x !== pk) : [];
                                                          setEditMetaField(key, arr);
                                                        }}
                                                        aria-label={`Remove ${display}`}
                                                      >
                                                        <XIcon size={12} />
                                                      </button>
                                                    </span>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          ) : (
                                            <select
                                              className="document-detail-metadata-input"
                                              value={typeof currentVal === 'string' ? currentVal : Array.isArray(currentVal) ? currentVal[0] ?? '' : ''}
                                              onChange={(e) => setEditMetaField(key, e.target.value || null)}
                                              aria-label={label}
                                            >
                                              <option value="">—</option>
                                              {instances.map((inst) => (
                                                <option key={inst.id} value={inst.id}>
                                                  {getInstanceDisplay(otid, inst)}
                                                </option>
                                              ))}
                                            </select>
                                          );
                                        })()
                                      ) : (
                                        <input
                                          type="text"
                                          className="document-detail-metadata-input"
                                          value={strVal}
                                          onChange={(e) => setEditMetaField(key, e.target.value || null)}
                                          aria-label={label}
                                        />
                                      )}
                                    </dd>
                                  </div>
                                );
                              })}
                            </dl>
                            <div className="document-detail-metadata-edit-actions">
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={handleSaveMetadata}
                                disabled={savingMetadata}
                              >
                                {savingMetadata ? <Loader2 size={12} className="doc-detail-spinner" /> : null}
                                <span>{savingMetadata ? 'Saving…' : 'Save'}</span>
                              </button>
                              <button
                                type="button"
                                className="document-detail-metadata-cancel-btn"
                                onClick={handleCancelMetadataEdit}
                                disabled={savingMetadata}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <dl className="document-detail-info-list document-detail-metadata-list">
                            {metaKeys.map((key) => {
                              const field = extractionSchemaFields.find((f) => f.key === key);
                              const lc = labelConfig.find((l: { key: string }) => l.key === key);
                              const label = field?.label ?? lc?.display_label ?? lc?.key ?? key;
                              const val = meta[key];
                              const isArray = Array.isArray(val);
                              const isLabelKey = labelKeysSet.has(key);
                              const otid = (field as { object_type_id?: string })?.object_type_id ?? lc?.object_type_id ?? '';
                              const instances = labelInstances[otid] ?? [];
                              const formatVal = (v: unknown) => {
                                if (isLabelKey && typeof v === 'string') {
                                  const inst = instances.find((i) => i.id === v);
                                  return inst ? getInstanceDisplay(otid, inst) : v;
                                }
                                return String(v);
                              };
                              return (
                                <div key={key} className="document-detail-info-item">
                                  <dt>{label}</dt>
                                  <dd>
                                    {val == null ? (
                                      '—'
                                    ) : isArray ? (
                                      <span className="document-detail-metadata-pills">
                                        {(val as unknown[]).map((v: unknown, i: number) => (
                                          <span key={i} className="document-detail-metadata-pill">
                                            {formatVal(v)}
                                          </span>
                                        ))}
                                      </span>
                                    ) : (
                                      formatVal(val)
                                    )}
                                  </dd>
                                </div>
                              );
                            })}
                          </dl>
                        )}
                        {extractWarnings.length > 0 && (
                          <div className="document-detail-extract-warnings" style={{ marginTop: 8 }}>
                            {extractWarnings.map((w, i) => (
                              <p key={i} className="document-detail-warning" style={{ color: 'var(--color-warning, #b45309)', fontSize: '0.9em' }}>
                                {w}
                              </p>
                            ))}
                          </div>
                        )}
                        <div className="document-detail-metadata-actions">
                          {!metadataEditMode && (
                          <button
                            type="button"
                            className="btn btn-primary document-detail-extract-btn"
                            onClick={handleExtract}
                            disabled={
                              extracting ||
                              !markdown ||
                              document?.status !== 'completed' ||
                              !hasExtractionModel
                            }
                            title={
                              !hasExtractionModel
                                ? 'Configure extraction model in channel settings'
                                : !markdown
                                  ? 'Document has no markdown'
                                  : document?.status !== 'completed'
                                    ? 'Document must be fully parsed'
                                    : 'Extract metadata using LLM'
                            }
                          >
                            {extracting ? (
                              <Loader2 size={14} className="doc-detail-spinner" />
                            ) : (
                              <Sparkles size={14} />
                            )}
                            <span>{extracting ? 'Extracting…' : 'Extract'}</span>
                          </button>
                          )}
                        </div>

                        <hr className="document-detail-info-divider document-detail-metadata-lineage-divider" />
                        <div className="document-detail-lineage document-detail-lineage--in-metadata">
                          <button
                            type="button"
                            className="document-detail-lineage-header"
                            onClick={() => setLineageSectionOpen((o) => !o)}
                            aria-expanded={lineageSectionOpen}
                            aria-controls="document-lineage-panel"
                            id="document-lineage-heading"
                          >
                            <GitBranch size={16} aria-hidden />
                            <span>Lineage & lifecycle</span>
                            {lineageSectionOpen ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
                          </button>
                          {!lineageSectionOpen && (
                            <p className="document-detail-lineage-hint document-detail-muted">
                              Policy series, validity window, relationships to other documents. Click to expand.
                            </p>
                          )}
                          {lineageSectionOpen && document && (
                            <div
                              id="document-lineage-panel"
                              className="document-detail-lineage-panel"
                              role="region"
                              aria-labelledby="document-lineage-heading"
                            >
                              <p className="document-detail-lineage-intro document-detail-muted">
                                <strong>Series</strong> groups editions of one policy. <strong>Relationships</strong> link this file to
                                others (replaces, amends, and so on).
                              </p>

                              <div className="document-detail-lineage-lifecycle-card">
                                <div className="document-detail-lineage-lifecycle-toolbar">
                                  <span className="document-detail-lineage-lifecycle-toolbar-label">Lifecycle</span>
                                  <div className="document-detail-lineage-lifecycle-toolbar-actions">
                                    {lifecycleEdit ? (
                                      <>
                                        <button
                                          type="button"
                                          className="btn btn-primary btn-sm"
                                          onClick={() => void handleSaveLifecycle()}
                                          disabled={lifecycleSaving}
                                        >
                                          {lifecycleSaving ? <Loader2 size={12} className="doc-detail-spinner" /> : null}
                                          Save
                                        </button>
                                        <button
                                          type="button"
                                          className="document-detail-metadata-cancel-btn"
                                          onClick={() => setLifecycleEdit(false)}
                                          disabled={lifecycleSaving}
                                        >
                                          Cancel
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        className="document-detail-metadata-edit-btn"
                                        onClick={() => setLifecycleEdit(true)}
                                      >
                                        <Edit3 size={12} />
                                        Edit
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="document-detail-lineage-field-grid">
                                  <div className="document-detail-lineage-field">
                                    <span className="document-detail-lineage-field-label">Applicable</span>
                                    <div>
                                      {document.is_current_for_rag === false ? (
                                        <span className="document-detail-lineage-pill document-detail-lineage-pill--off">
                                          Not applicable
                                        </span>
                                      ) : (
                                        <span className="document-detail-lineage-pill document-detail-lineage-pill--on">
                                          Applicable
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="document-detail-lineage-field">
                                    <span className="document-detail-lineage-field-label">Lifecycle status</span>
                                    <div className="document-detail-lineage-field-value">
                                      {lifecycleEdit ? (
                                        <select
                                          className="document-detail-info-input document-detail-lineage-input"
                                          value={editLifecycleStatus}
                                          onChange={(e) => setEditLifecycleStatus(e.target.value)}
                                          aria-label="Lifecycle status"
                                        >
                                          <option value="">— (unset)</option>
                                          {DOCUMENT_LIFECYCLE_STATUSES.map((s) => (
                                            <option key={s} value={s}>
                                              {s}
                                            </option>
                                          ))}
                                        </select>
                                      ) : (
                                        <span>{document.lifecycle_status ?? '—'}</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="document-detail-lineage-field document-detail-lineage-field--full">
                                    <span className="document-detail-lineage-field-label">Series ID</span>
                                    <div className="document-detail-lineage-field-value">
                                      {lifecycleEdit ? (
                                        <input
                                          type="text"
                                          className="document-detail-info-input document-detail-lineage-input"
                                          value={editSeriesId}
                                          onChange={(e) => setEditSeriesId(e.target.value)}
                                          aria-label="Series ID"
                                        />
                                      ) : (
                                        <code className="document-detail-lineage-series-id" title={document.series_id ?? document.id}>
                                          {document.series_id ?? document.id}
                                        </code>
                                      )}
                                    </div>
                                  </div>
                                  <div className="document-detail-lineage-field">
                                    <span className="document-detail-lineage-field-label">Effective from</span>
                                    <div className="document-detail-lineage-field-value">
                                      {lifecycleEdit ? (
                                        <input
                                          type="datetime-local"
                                          className="document-detail-info-input document-detail-lineage-input"
                                          value={editEffectiveFrom}
                                          onChange={(e) => setEditEffectiveFrom(e.target.value)}
                                          aria-label="Effective from"
                                        />
                                      ) : (
                                        <span>{(document.effective_from && new Date(document.effective_from).toLocaleString()) || '—'}</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="document-detail-lineage-field">
                                    <span className="document-detail-lineage-field-label">Effective to</span>
                                    <div className="document-detail-lineage-field-value">
                                      {lifecycleEdit ? (
                                        <input
                                          type="datetime-local"
                                          className="document-detail-info-input document-detail-lineage-input"
                                          value={editEffectiveTo}
                                          onChange={(e) => setEditEffectiveTo(e.target.value)}
                                          aria-label="Effective to"
                                        />
                                      ) : (
                                        <span>{(document.effective_to && new Date(document.effective_to).toLocaleString()) || '—'}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="document-detail-lineage-rel-block">
                              <h4 className="document-detail-lineage-section-title">Relationships</h4>
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
                                              <th>Other document</th>
                                              <th />
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {lineageRels.outgoing.map((r) => (
                                              <tr key={r.id}>
                                                <td>{r.relation_type}</td>
                                                <td>
                                                  <Link to={`/documents/${r.peer_document_id}`}>{r.peer_document_name || r.peer_document_id}</Link>
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
                                              <th>Other document</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {lineageRels.incoming.map((r) => (
                                              <tr key={r.id}>
                                                <td>{r.relation_type}</td>
                                                <td>
                                                  <Link to={`/documents/${r.peer_document_id}`}>{r.peer_document_name || r.peer_document_id}</Link>
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
                                        {DOCUMENT_RELATION_TYPES.map((t) => (
                                          <option key={t} value={t}>
                                            {t}
                                          </option>
                                        ))}
                                      </select>
                                      <input
                                        type="text"
                                        className="document-detail-info-input"
                                        placeholder="Target document ID"
                                        value={newRelTarget}
                                        onChange={(e) => setNewRelTarget(e.target.value)}
                                        aria-label="Target document ID"
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
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>
          )}
          {error ? (
            <div className="document-detail-error">{error}</div>
          ) : (
        <>
        <div
          className="document-detail-split"
          data-extended-images={extendedPanel === 'images'}
          data-extended-markdown={extendedPanel === 'markdown'}
        >
          <section className="document-detail-panel document-detail-images">
            <h2 className="document-detail-panel-header">
              <ImageIcon size={16} />
              <span>Document Pages</span>
              <button
                type="button"
                className="document-detail-extend-btn"
                onClick={() => setExtendedPanel((p) => (p === 'images' ? null : 'images'))}
                title={extendedPanel === 'images' ? 'Restore split view' : 'Extend to view larger'}
                aria-label={extendedPanel === 'images' ? 'Restore split view' : 'Extend document pages'}
              >
                {extendedPanel === 'images' ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </h2>
            <div className="document-detail-images-body">
              {parsingResult?.layout_det_res && parsingResult.layout_det_res.length > 0 ? (
                parsingResult.layout_det_res
                  .filter((item) => item.input_img)
                  .map((item, pageIndex) => {
                    const dims = pageDimensions[pageIndex];
                    const blocks = pageBlocks.filter((b) => b.pageIndex === pageIndex);
                    return (
                      <div key={pageIndex} className="document-detail-page-item">
                        <span className="document-detail-page-no">Page {pageIndex + 1}</span>
                        <div
                          className="document-detail-page-img-wrap"
                          onMouseMove={(e) => handlePageMouseMove(e, pageIndex)}
                          onMouseLeave={() => setHoveredBlockKey(null)}
                        >
                          <AuthImage
                            onLoad={(e) => onPageImageLoad(pageIndex, e.currentTarget as HTMLImageElement)}
                            src={folderId ? `/examples/${item.input_img}` : (item.input_img ? getImageUrl(item.input_img) : '')}
                            alt={`Page ${pageIndex + 1}`}
                            className="document-detail-layout-img"
                            loading="lazy"
                          />
                          {dims && blocks.map((block, bi) => {
                            const [x1, y1, x2, y2] = block.coordinate;
                            const left = (x1 / dims.w) * 100;
                            const top = (y1 / dims.h) * 100;
                            const width = ((x2 - x1) / dims.w) * 100;
                            const height = ((y2 - y1) / dims.h) * 100;
                            const blockKey = `${pageIndex}-${bi}`;
                            const isSelected = selectedBlock === block;
                            const isHovered = hoveredBlockKey === blockKey;
                            const isHighlighted = isSelected || isHovered;
                            return (
                              <div
                                key={bi}
                                className={`document-detail-bbox ${isHighlighted ? 'document-detail-bbox--visible' : ''} ${isSelected ? 'document-detail-bbox--selected' : ''}`}
                                style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
                                onMouseEnter={() => setHoveredBlockKey(blockKey)}
                                onMouseLeave={() => setHoveredBlockKey(null)}
                                onClick={(e) => { e.stopPropagation(); setSelectedBlock(block); }}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => e.key === 'Enter' && setSelectedBlock(block)}
                                title={block.parsingItem.content?.slice(0, 50) || block.label}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
              ) : (
                <p className="document-detail-muted">No layout images</p>
              )}
            </div>
          </section>
          <section className="document-detail-panel document-detail-markdown">
            <h2 className="document-detail-panel-header">
              <div className="document-detail-panel-tabs">
                <button
                  type="button"
                  className={`document-detail-panel-tab ${rightPanelView === 'markdown' ? 'document-detail-panel-tab--active' : ''}`}
                  onClick={() => setRightPanelView('markdown')}
                  aria-pressed={rightPanelView === 'markdown'}
                >
                  <FileText size={14} />
                  <span>Markdown</span>
                </button>
                <button
                  type="button"
                  className={`document-detail-panel-tab ${rightPanelView === 'pageIndex' ? 'document-detail-panel-tab--active' : ''}`}
                  onClick={() => setRightPanelView('pageIndex')}
                  aria-pressed={rightPanelView === 'pageIndex'}
                >
                  <ListTree size={14} />
                  <span>Page Index</span>
                </button>
              </div>
              {rightPanelView === 'markdown' && !docConfig && (
                markdownEditMode ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary document-detail-save-btn"
                      onClick={handleSaveMarkdown}
                      disabled={saving}
                      title="Save markdown"
                    >
                      {saving ? <Loader2 size={14} className="doc-detail-spinner" /> : null}
                      <span>{saving ? 'Saving…' : 'Save'}</span>
                    </button>
                    <button
                      type="button"
                      className="document-detail-edit-toggle"
                      onClick={() => {
                        setMarkdown(document?.markdown ?? '');
                        setMarkdownEditMode(false);
                      }}
                      disabled={saving}
                      title="Cancel and discard changes"
                    >
                      <XIcon size={14} />
                      <span>Cancel</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="document-detail-edit-toggle"
                    onClick={() => {
                      setSelectedBlock(null);
                      setMarkdownEditMode(true);
                    }}
                    title="Edit markdown"
                    aria-pressed={false}
                  >
                    <Edit3 size={14} />
                    <span>Edit</span>
                  </button>
                )
              )}
              {rightPanelView === 'pageIndex' && !docConfig && (
                <button
                  type="button"
                  className="document-detail-edit-toggle"
                  onClick={handleRebuildPageIndex}
                  disabled={pageIndexRebuilding}
                  title="parse markdown to tree"
                  aria-label="parse markdown to tree"
                >
                  {pageIndexRebuilding ? (
                    <Loader2 size={14} className="doc-detail-spinner" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                </button>
              )}
              <button
                type="button"
                className="document-detail-extend-btn"
                onClick={() => setExtendedPanel((p) => (p === 'markdown' ? null : 'markdown'))}
                title={extendedPanel === 'markdown' ? 'Restore split view' : 'Extend to view larger'}
                aria-label={extendedPanel === 'markdown' ? 'Restore split view' : 'Extend markdown content'}
              >
                {extendedPanel === 'markdown' ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </h2>
            <div className="document-detail-markdown-body">
              {rightPanelView === 'pageIndex' ? (
                <PageIndexTree
                  pageIndex={pageIndex}
                  loading={pageIndexLoading}
                  error={pageIndexError}
                  docConfig={docConfig}
                  markdown={markdown}
                  markdownComponents={markdownComponents}
                />
              ) : selectedBlock && !markdownEditMode ? (
                <div key="block-view" className="document-detail-block-view">
                  <button
                    type="button"
                    className="document-detail-block-back"
                    onClick={() => setSelectedBlock(null)}
                  >
                    ← Show full content
                  </button>
                  <div className="document-detail-block-meta">
                    <span className="document-detail-block-label">{selectedBlock.label}</span>
                  </div>
                  {selectedBlock.parsingItem.image_path ? (
                    <AuthImage
                      src={folderId ? `/examples/${selectedBlock.parsingItem.image_path}` : getImageUrl(selectedBlock.parsingItem.image_path)}
                      alt={selectedBlock.parsingItem.label || 'Block'}
                      className="document-detail-block-img"
                      loading="lazy"
                    />
                  ) : selectedBlock.parsingItem.content ? (
                    <div className="document-detail-block-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeRaw, rehypeKatex]}
                        components={markdownComponents}
                      >
                        {selectedBlock.parsingItem.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="document-detail-muted">No content</p>
                  )}
                </div>
              ) : markdownEditMode && !docConfig ? (
                <div key="edit-view" className="document-detail-markdown-edit">
                  <textarea
                    className="document-detail-markdown-textarea"
                    value={markdown ?? ''}
                    onChange={(e) => setMarkdown(e.target.value)}
                    placeholder="Markdown content..."
                  />
                  <div className="document-detail-markdown-actions">
                    <button
                      type="button"
                      className="document-detail-restore-btn"
                      onClick={handleRestoreMarkdown}
                      disabled={restoring || !fileHash}
                      title={!fileHash ? 'No file hash – restore not available' : 'Restore from original storage'}
                    >
                      {restoring ? <Loader2 size={14} className="doc-detail-spinner" /> : <RotateCcw size={14} />}
                      <span>{restoring ? 'Restoring…' : 'Restore'}</span>
                    </button>
                  </div>
                </div>
              ) : markdown && (folderId || markdownBaseUrl) ? (
                <div key="markdown-view">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeRaw, rehypeKatex]}
                  components={markdownComponents}
                >
                  {markdown}
                </ReactMarkdown>
                </div>
              ) : (
                <p key="empty-view" className="document-detail-muted">No markdown content</p>
              )}
            </div>
          </section>
        </div>
        {!docConfig && id && (
          <>
            {saveVersionModalOpen && (
              <div
                className="document-detail-pageindex-dialog-overlay"
                onClick={() => !saveVersionSubmitting && setSaveVersionModalOpen(false)}
              >
                <div
                  className="document-detail-pageindex-dialog document-detail-save-version-dialog"
                  onClick={(e) => e.stopPropagation()}
                  role="dialog"
                  aria-labelledby="save-version-title"
                >
                  <div className="document-detail-pageindex-dialog-header">
                    <h2 id="save-version-title">Save as version</h2>
                    <button
                      type="button"
                      className="document-detail-pageindex-dialog-close"
                      onClick={() => !saveVersionSubmitting && setSaveVersionModalOpen(false)}
                      aria-label="Close"
                    >
                      <XIcon size={18} />
                    </button>
                  </div>
                  <div className="document-detail-save-version-body">
                    <p className="document-detail-save-version-hint">
                      Saves a checkpoint of the current markdown and metadata. Ordinary saves do not add a version.
                    </p>
                    <div className="document-detail-save-version-field">
                      <label htmlFor="save-version-tag" className="document-detail-save-version-label">
                        Tag <span className="document-detail-save-version-optional">(optional)</span>
                      </label>
                      <input
                        id="save-version-tag"
                        type="text"
                        className="document-detail-save-version-input"
                        value={saveVersionTag}
                        onChange={(e) => setSaveVersionTag(e.target.value)}
                        placeholder="e.g. Before review"
                        autoComplete="off"
                        disabled={saveVersionSubmitting}
                      />
                    </div>
                    <div className="document-detail-save-version-actions">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleCreateVersion}
                        disabled={saveVersionSubmitting}
                      >
                        {saveVersionSubmitting ? <Loader2 size={14} className="doc-detail-spinner" /> : null}
                        <span>{saveVersionSubmitting ? 'Saving…' : 'Create version'}</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary document-detail-save-version-cancel"
                        onClick={() => !saveVersionSubmitting && setSaveVersionModalOpen(false)}
                        disabled={saveVersionSubmitting}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {versionsModalOpen && (
              <div
                className="document-detail-pageindex-dialog-overlay"
                onClick={() => !restoreSubmitting && setVersionsModalOpen(false)}
              >
                <div
                  className="document-detail-pageindex-dialog document-detail-versions-dialog document-detail-versions-dialog--wide"
                  onClick={(e) => e.stopPropagation()}
                  role="dialog"
                  aria-labelledby="versions-list-title"
                >
                  <div className="document-detail-pageindex-dialog-header">
                    <h2 id="versions-list-title">Document versions</h2>
                    <button
                      type="button"
                      className="document-detail-pageindex-dialog-close"
                      onClick={() => !restoreSubmitting && setVersionsModalOpen(false)}
                      aria-label="Close"
                    >
                      <XIcon size={18} />
                    </button>
                  </div>
                  <div className="document-detail-pageindex-dialog-body">
                    {versionsLoading ? (
                      <div className="document-detail-pageindex-loading">
                        <Loader2 size={20} className="doc-detail-spinner" />
                        <span>Loading…</span>
                      </div>
                    ) : versionsItems.length === 0 ? (
                      <p className="document-detail-muted">No versions yet. Use &quot;Save version&quot; to create one.</p>
                    ) : (
                      <table className="document-detail-versions-table">
                        <thead>
                          <tr>
                            <th scope="col">Version</th>
                            <th scope="col">Tag</th>
                            <th scope="col">Saved</th>
                            <th scope="col" className="document-detail-versions-th-actions">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {versionsItems.map((v) => (
                            <tr key={v.id}>
                              <td>
                                <span className="document-detail-versions-vno">v{v.version_number}</span>
                              </td>
                              <td>
                                {v.tag ? (
                                  <span className="document-detail-versions-tag">{v.tag}</span>
                                ) : (
                                  <span className="document-detail-versions-empty">—</span>
                                )}
                              </td>
                              <td>
                                <time
                                  className="document-detail-versions-date"
                                  dateTime={v.created_at}
                                >
                                  {new Date(v.created_at).toLocaleString()}
                                </time>
                              </td>
                              <td className="document-detail-versions-td-actions">
                                <div className="document-detail-versions-actions">
                                  <button
                                    type="button"
                                    className="btn btn-sm"
                                    onClick={() => handlePreviewVersion(v.id)}
                                  >
                                    Preview
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={() => setRestoreModalVersion(v)}
                                  >
                                    Restore
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            )}
            {versionPreview && (
              <div
                className="document-detail-pageindex-dialog-overlay"
                onClick={() => setVersionPreview(null)}
              >
                <div
                  className="document-detail-pageindex-dialog document-detail-versions-dialog document-detail-versions-dialog--wide"
                  onClick={(e) => e.stopPropagation()}
                  role="dialog"
                >
                  <div className="document-detail-pageindex-dialog-header">
                    <h2 id="version-preview-title">
                      v{versionPreview.version_number}
                      {versionPreview.tag ? ` — ${versionPreview.tag}` : ''}
                    </h2>
                    <button
                      type="button"
                      className="document-detail-pageindex-dialog-close"
                      onClick={() => setVersionPreview(null)}
                      aria-label="Close"
                    >
                      <XIcon size={18} />
                    </button>
                  </div>
                  <div className="document-detail-pageindex-dialog-body document-detail-version-preview-body">
                    {versionPreviewLoading ? (
                      <Loader2 className="doc-detail-spinner" />
                    ) : (
                      <>
                        <h3 className="document-detail-version-preview-sub">Markdown</h3>
                        <div className="document-detail-version-preview-md">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeRaw, rehypeKatex]}
                            components={markdownComponents}
                          >
                            {versionPreview.markdown || ''}
                          </ReactMarkdown>
                        </div>
                        <h3 className="document-detail-version-preview-sub">Metadata</h3>
                        <pre className="document-detail-version-preview-json">
                          {JSON.stringify(versionPreview.metadata ?? {}, null, 2)}
                        </pre>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
            {restoreModalVersion && (
              <div
                className="document-detail-pageindex-dialog-overlay"
                onClick={() => !restoreSubmitting && setRestoreModalVersion(null)}
              >
                <div
                  className="document-detail-pageindex-dialog document-detail-versions-dialog"
                  onClick={(e) => e.stopPropagation()}
                  role="dialog"
                  aria-labelledby="restore-version-title"
                >
                  <div className="document-detail-pageindex-dialog-header">
                    <h2 id="restore-version-title">Restore version v{restoreModalVersion.version_number}?</h2>
                    <button
                      type="button"
                      className="document-detail-pageindex-dialog-close"
                      onClick={() => !restoreSubmitting && setRestoreModalVersion(null)}
                      aria-label="Close"
                    >
                      <XIcon size={18} />
                    </button>
                  </div>
                  <div className="document-detail-pageindex-dialog-body document-detail-versions-form">
                    <p className="document-detail-muted" style={{ marginTop: 0 }}>
                      Replaces the working copy markdown and metadata with this snapshot.
                    </p>
                    <label className="document-detail-versions-check">
                      <input
                        type="checkbox"
                        checked={restoreSaveCurrent}
                        onChange={(e) => setRestoreSaveCurrent(e.target.checked)}
                      />
                      Save current state as a version first
                    </label>
                    {restoreSaveCurrent && (
                      <>
                        <label className="document-detail-versions-label">
                          Label (optional)
                          <input
                            type="text"
                            className="document-detail-info-input"
                            value={restoreLabel}
                            onChange={(e) => setRestoreLabel(e.target.value)}
                            placeholder="Checkpoint before restore"
                          />
                        </label>
                        <label className="document-detail-versions-label">
                          Note (optional)
                          <textarea
                            className="document-detail-markdown-textarea"
                            rows={2}
                            value={restoreNote}
                            onChange={(e) => setRestoreNote(e.target.value)}
                            style={{ minHeight: 56 }}
                          />
                        </label>
                      </>
                    )}
                    <div className="document-detail-metadata-edit-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={handleConfirmRestore}
                        disabled={restoreSubmitting}
                      >
                        {restoreSubmitting ? <Loader2 size={12} className="doc-detail-spinner" /> : null}
                        <span>{restoreSubmitting ? 'Restoring…' : 'Restore'}</span>
                      </button>
                      <button
                        type="button"
                        className="document-detail-metadata-cancel-btn"
                        onClick={() => !restoreSubmitting && setRestoreModalVersion(null)}
                        disabled={restoreSubmitting}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        </>
          )}
        </>
      )}
    </div>
  );
}
