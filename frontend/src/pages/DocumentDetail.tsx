import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, Edit3, Eye, FileText, Image as ImageIcon, Maximize2, Minimize2, Info, Play, Loader2, RotateCcw, Sparkles, Tag, X as XIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { toast } from 'sonner';
import { fetchDocumentById, extractDocumentMetadata, getDocumentFileUrl, getDocumentFilesBaseUrl, resetDocumentStatus, updateDocument, updateDocumentMetadata, updateDocumentMarkdown, restoreDocumentMarkdown, type DocumentResponse } from '../data/documentsApi';
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
  const [savingLabels, setSavingLabels] = useState(false);
  const [editLabels, setEditLabels] = useState<Record<string, string | string[]>>({});
  const [labelObjectTypes, setLabelObjectTypes] = useState<Record<string, { display_property?: string | null; key_property?: string | null }>>({});
  const [labelInstances, setLabelInstances] = useState<Record<string, { id: string; data: Record<string, unknown> }[]>>({});

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
      img: ({ src, ...props }: { src?: string }) => (
        <img
          src={src?.startsWith('/') ? src : `${markdownBaseUrl}/${src}`}
          loading="lazy"
          crossOrigin={markdownBaseUrl.startsWith('http') ? 'use-credentials' : undefined}
          {...props}
        />
      ),
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
  const metaKeys = extractionSchemaFields.length > 0
    ? extractionSchemaFields.map((f) => f.key)
    : Object.keys(meta).filter((k) => !['extracted_at', 'extraction_model_id'].includes(k));
  const showMetadataSection = !docConfig && document?.channel_id;
  const showLabelsSection = !docConfig && document?.channel_id && labelConfig.length > 0;

  useEffect(() => {
    if (document?.labels) {
      setEditLabels(document.labels as Record<string, string | string[]>);
    } else if (labelConfig.length > 0) {
      setEditLabels({});
    }
  }, [document?.labels, labelConfig.length]);

  useEffect(() => {
    if (labelConfig.length === 0) return;
    let cancelled = false;
    const load = async () => {
      const uniqueIds = [...new Set(labelConfig.map((l: { object_type_id: string }) => l.object_type_id))];
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
  }, [channel?.id, JSON.stringify((channel?.label_config ?? []).map((l: { object_type_id: string }) => l.object_type_id))]);

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

  const handleSaveLabels = useCallback(async () => {
    if (!id) return;
    setSavingLabels(true);
    try {
      const updated = await updateDocument(id, { labels: editLabels });
      setDocument(updated);
      toast.success('Labels saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save labels');
    } finally {
      setSavingLabels(false);
    }
  }, [id, editLabels]);

  const setLabelValue = useCallback((key: string, value: string | string[]) => {
    setEditLabels((prev) => ({ ...prev, [key]: value }));
  }, []);

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
    try {
      const updated = await extractDocumentMetadata(id);
      setDocument(updated);
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
      toast.success('Markdown restored from storage');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setRestoring(false);
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
    const keys = extractionSchemaFields.length > 0
      ? extractionSchemaFields.map((f) => f.key)
      : Object.keys(meta).filter((k) => !['extracted_at', 'extraction_model_id'].includes(k));
    const initial: Record<string, unknown> = {};
    for (const key of keys) {
      initial[key] = meta[key] ?? '';
    }
    setEditMeta(initial);
    setMetadataEditMode(true);
  }, [document?.metadata, extractionSchemaFields]);

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
                  <dl className={`document-detail-info-list ${fileHash ? 'document-detail-info-list--with-hash' : ''}`}>
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
                    {fileHash && (
                      <div className="document-detail-info-item document-detail-info-item--compact">
                        <dt>File hash</dt>
                        <dd className="document-detail-info-hash" title={fileHash}>
                          {fileHash.length > 12
                            ? `${fileHash.slice(0, 10)}...`
                            : fileHash}
                        </dd>
                      </div>
                    )}
                  </dl>
                  {showMetadataSection && (
                    <>
                      <hr className="document-detail-info-divider" />
                      <div className="document-detail-metadata-body">
                        <h3 className="document-detail-metadata-subtitle">
                          <Sparkles size={16} />
                          Extracted metadata
                          {(metaKeys.length > 0 || extractionSchemaFields.length > 0) && !metadataEditMode ? (
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
                            No metadata extracted. Click Extract to use LLM.
                            {!hasExtractionModel && ' (Configure an extraction model in channel settings.)'}
                          </p>
                        ) : metadataEditMode ? (
                          <div className="document-detail-metadata-edit">
                            <dl className="document-detail-info-list document-detail-metadata-list">
                              {(extractionSchemaFields.length > 0 ? extractionSchemaFields.map((f) => f.key) : metaKeys).map((key) => {
                                const field = extractionSchemaFields.find((f) => f.key === key);
                                const label = field?.label ?? key;
                                const fieldType = field?.type ?? 'string';
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
                              const label = extractionSchemaFields.find((f) => f.key === key)?.label ?? key;
                              const val = meta[key];
                              const isArray = Array.isArray(val);
                              return (
                                <div key={key} className="document-detail-info-item">
                                  <dt>{label}</dt>
                                  <dd>
                                    {val == null ? (
                                      '—'
                                    ) : isArray ? (
                                      <span className="document-detail-metadata-pills">
                                        {val.map((v: unknown, i: number) => (
                                          <span key={i} className="document-detail-metadata-pill">
                                            {String(v)}
                                          </span>
                                        ))}
                                      </span>
                                    ) : (
                                      String(val)
                                    )}
                                  </dd>
                                </div>
                              );
                            })}
                          </dl>
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
                      </div>
                    </>
                  )}
                  {showLabelsSection && (
                    <>
                      <hr className="document-detail-info-divider" />
                      <div className="document-detail-labels-body">
                        <h3 className="document-detail-metadata-subtitle">
                          <Tag size={16} />
                          Labels
                        </h3>
                        <dl className="document-detail-info-list document-detail-labels-list">
                          {labelConfig.map((lc: { key: string; object_type_id: string; display_label?: string | null; allow_multiple?: boolean }) => {
                            const label = lc.display_label || lc.key;
                            const instances = labelInstances[lc.object_type_id] ?? [];
                            const currentVal = editLabels[lc.key];
                            const allowMultiple = lc.allow_multiple ?? false;
                            return (
                              <div key={lc.key} className="document-detail-info-item document-detail-info-item--edit">
                                <dt>{label}</dt>
                                <dd>
                                  {allowMultiple ? (
                                    <div className="document-detail-labels-multi">
                                      <select
                                        className="document-detail-metadata-input"
                                        value=""
                                        onChange={(e) => {
                                          const pk = e.target.value;
                                          if (!pk) return;
                                          const arr = Array.isArray(currentVal) ? [...currentVal] : currentVal ? [currentVal] : [];
                                          if (!arr.includes(pk)) {
                                            setLabelValue(lc.key, [...arr, pk]);
                                          }
                                          e.target.value = '';
                                        }}
                                        aria-label={`Add ${label}`}
                                      >
                                        <option value="">— Add —</option>
                                        {instances.map((inst) => (
                                          <option key={inst.id} value={inst.id}>
                                            {getInstanceDisplay(lc.object_type_id, inst)}
                                          </option>
                                        ))}
                                      </select>
                                      <div className="document-detail-labels-pills">
                                        {(Array.isArray(currentVal) ? currentVal : currentVal ? [currentVal] : []).map((pk) => {
                                          const inst = instances.find((i) => i.id === pk);
                                          const display = inst ? getInstanceDisplay(lc.object_type_id, inst) : pk;
                                          return (
                                            <span key={pk} className="document-detail-metadata-pill document-detail-labels-pill">
                                              {display}
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const arr = Array.isArray(currentVal) ? currentVal.filter((x) => x !== pk) : [];
                                                  setLabelValue(lc.key, arr);
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
                                      onChange={(e) => setLabelValue(lc.key, e.target.value || '')}
                                      aria-label={label}
                                    >
                                      <option value="">—</option>
                                      {instances.map((inst) => (
                                        <option key={inst.id} value={inst.id}>
                                          {getInstanceDisplay(lc.object_type_id, inst)}
                                        </option>
                                      ))}
                                    </select>
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
                            onClick={handleSaveLabels}
                            disabled={savingLabels}
                          >
                            {savingLabels ? <Loader2 size={12} className="doc-detail-spinner" /> : null}
                            <span>{savingLabels ? 'Saving…' : 'Save labels'}</span>
                          </button>
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
                          <img
                            onLoad={(e) => onPageImageLoad(pageIndex, e.currentTarget)}
                            src={folderId ? `/examples/${item.input_img}` : (item.input_img ? getImageUrl(item.input_img) : '')}
                            alt={`Page ${pageIndex + 1}`}
                            className="document-detail-layout-img"
                            loading="lazy"
                            crossOrigin={!folderId ? 'use-credentials' : undefined}
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
              <FileText size={16} />
              <span>Markdown Content</span>
              {!docConfig && (
                <button
                  type="button"
                  className={`document-detail-edit-toggle ${markdownEditMode ? 'document-detail-edit-toggle--active' : ''}`}
                  onClick={() => {
                    if (!markdownEditMode) setSelectedBlock(null);
                    setMarkdownEditMode((v) => !v);
                  }}
                  title={markdownEditMode ? 'Switch to view mode' : 'Edit markdown'}
                  aria-pressed={markdownEditMode}
                >
                  {markdownEditMode ? <Eye size={14} /> : <Edit3 size={14} />}
                  <span>{markdownEditMode ? 'View' : 'Edit'}</span>
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
              {selectedBlock && !markdownEditMode ? (
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
                    <img
                      src={folderId ? `/examples/${selectedBlock.parsingItem.image_path}` : getImageUrl(selectedBlock.parsingItem.image_path)}
                      alt={selectedBlock.parsingItem.label || 'Block'}
                      className="document-detail-block-img"
                      loading="lazy"
                      crossOrigin={!folderId ? 'use-credentials' : undefined}
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
                      className="btn btn-primary document-detail-save-btn"
                      onClick={handleSaveMarkdown}
                      disabled={saving}
                    >
                      {saving ? <Loader2 size={14} className="doc-detail-spinner" /> : null}
                      <span>{saving ? 'Saving…' : 'Save'}</span>
                    </button>
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
          )}
        </>
      )}
    </div>
  );
}
