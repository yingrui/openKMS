import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import {
  richMarkdownPreComponent,
} from '../components/markdown/richMarkdown';
import { toast } from 'sonner';
import {
  createDocumentRelationship,
  createDocumentVersion,
  deleteDocumentRelationship,
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
import { findChannel, normalizeExtractionSchemaToFields, type LabelConfigItem } from '../data/channelUtils';
import { DocumentDetailSplitPanel } from './DocumentDetail.splitPanel';
import { DocumentDetailInfoPanel } from './DocumentDetail.infoPanel';
import { DocumentDetailVersionModals } from './DocumentDetail.modals';
import type { PageBlock, ParsingResult } from './DocumentDetail.types';
import {
  buildPageBlocks,
  documentToFolder,
  getPageImageItems,
  shouldStartInLargeDocumentMode,
} from './DocumentDetail.utils';
import './DocumentDetail.css';

export function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation('documents');
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
  const [forceFullReparse, setForceFullReparse] = useState(false);
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
  const [spreadsheetSheetIndex, setSpreadsheetSheetIndex] = useState(0);
  const [deferLargeDocImages, setDeferLargeDocImages] = useState(false);

  const docConfig = id ? documentToFolder[id] : null;
  const folderId = docConfig?.folderId ?? null;
  const showPrintButton = rightPanelView === 'markdown' && !markdownEditMode && !selectedBlock && !docConfig;

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
              const largeDocMode = shouldStartInLargeDocumentMode(result, md);
              setParsingResult(result);
              setMarkdown(md);
              setDeferLargeDocImages(largeDocMode);
              setExtendedPanel(null);
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
            if (!cancelled && e?.name !== 'AbortError') setError(t('detail.loadContentFailed'));
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      } else {
        fetchDocumentById(id, signal)
          .then((doc) => {
            if (!cancelled && doc) {
              const nextParsing = (doc.parsing_result ?? null) as ParsingResult | null;
              const nextMarkdown = doc.markdown ?? '';
              const largeDocMode = shouldStartInLargeDocumentMode(nextParsing, nextMarkdown);
              setDocument(doc);
              setParsingResult(nextParsing);
              setMarkdown(nextMarkdown);
              setDeferLargeDocImages(largeDocMode);
              setExtendedPanel(null);
            }
          })
          .catch((e) => {
            if (!cancelled && e?.name !== 'AbortError') setError(e instanceof Error ? e.message : t('detail.loadDocFailed'));
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
  }, [id, docConfig, t]);

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
          setPageIndexError(e instanceof Error ? e.message : t('detail.loadPageIndexFailed'));
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
  }, [id, rightPanelView, docConfig, pageIndexRefreshKey, t]);

  /** Images: examples use /examples/, backend docs use proxy. */
  const getImageUrl = (path: string) => (id ? getDocumentFileUrl(id, path) : '');

  const fileHash = parsingResult?.file_hash ?? document?.file_hash ?? '';
  const markdownBaseUrl = folderId
    ? `/examples/${folderId}/markdown_out`
    : (id && fileHash
        ? `${getDocumentFilesBaseUrl(id)}/${encodeURIComponent(fileHash)}/markdown_out`
        : '');

  const pageImageItems = useMemo(
    () => getPageImageItems(parsingResult?.layout_det_res),
    [parsingResult?.layout_det_res]
  );

  const shouldRenderDeferredImages = !deferLargeDocImages;

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
      pre: richMarkdownPreComponent(),
    }),
    [markdownBaseUrl]
  );

  // Build page blocks: for each layout box, find parsing item by matching coordinates
  const pageBlocks = useMemo(
    () => buildPageBlocks(parsingResult, shouldRenderDeferredImages),
    [parsingResult, shouldRenderDeferredImages]
  );

  const isSpreadsheetLayout =
    (document?.file_type ?? '').toUpperCase() === 'XLSX' || parsingResult?.document_kind === 'spreadsheet';

  const isMindmapLayout =
    (document?.file_type ?? '').toUpperCase() === 'XMIND' || parsingResult?.document_kind === 'mindmap';

  const isStructuredNonVlmLayout = isSpreadsheetLayout || isMindmapLayout;

  const spreadsheetSheets =
    parsingResult?.document_kind === 'spreadsheet' && Array.isArray(parsingResult.sheets)
      ? parsingResult.sheets
      : null;

  const mindmapSheets =
    parsingResult?.document_kind === 'mindmap' && Array.isArray(parsingResult.sheets)
      ? parsingResult.sheets
      : null;

  const mindmapAttachments =
    parsingResult?.document_kind === 'mindmap' && Array.isArray(parsingResult.attachments)
      ? parsingResult.attachments
      : null;

  useEffect(() => {
    setSpreadsheetSheetIndex(0);
  }, [id, parsingResult?.document_kind, spreadsheetSheets?.length]);

  useEffect(() => {
    if (isStructuredNonVlmLayout && rightPanelView === 'pageIndex') {
      setRightPanelView('markdown');
    }
  }, [isStructuredNonVlmLayout, rightPanelView]);

  const activeSpreadsheetSheet =
    spreadsheetSheets && spreadsheetSheets.length > 0
      ? spreadsheetSheets[Math.min(spreadsheetSheetIndex, spreadsheetSheets.length - 1)]
      : null;

  const handleLoadDeferredImages = useCallback(() => {
    setDeferLargeDocImages(false);
  }, []);

  const handleToggleImagesPanel = useCallback(() => {
    if (deferLargeDocImages) setDeferLargeDocImages(false);
    setExtendedPanel((p) => (p === 'images' ? null : 'images'));
  }, [deferLargeDocImages]);

  const onPageImageLoad = useCallback((pageIndex: number, img: HTMLImageElement) => {
    if (img?.naturalWidth && img?.naturalHeight) {
      setPageDimensions((p) => ({ ...p, [pageIndex]: { w: img.naturalWidth, h: img.naturalHeight } }));
    }
  }, []);

  const channel = document?.channel_id ? findChannel(channels, document.channel_id) : null;
  const hasExtractionModel = !!channel?.extraction_model_id;
  const extractionSchemaFields = useMemo(
    () => normalizeExtractionSchemaToFields(channel?.extraction_schema ?? null),
    [channel?.extraction_schema]
  );
  const labelConfig = useMemo((): LabelConfigItem[] => {
    return (channel?.label_config ?? []).filter((l): l is LabelConfigItem => Boolean(l.key && l.object_type_id));
  }, [channel?.label_config]);
  const meta = useMemo(() => document?.metadata ?? {}, [document?.metadata]);
  const labelKeys = labelConfig.map((l) => l.key);
  const metaKeys = useMemo(() => {
    const ek = extractionSchemaFields.map((f) => f.key);
    const lk = labelConfig.map((l) => l.key);
    return ek.length > 0 || lk.length > 0
      ? [...ek, ...lk.filter((k) => !ek.includes(k))]
      : Object.keys(meta).filter((k) => !['extracted_at', 'extraction_model_id'].includes(k));
  }, [extractionSchemaFields, labelConfig, meta]);
  const showMetadataSection = Boolean(!docConfig && document?.channel_id);
  const labelKeysSet = new Set(labelKeys);

  const extractionObjectTypeIds = useMemo(
    () =>
      extractionSchemaFields
        .filter(
          (f) =>
            (f.type === 'object_type' || f.type === 'list[object_type]') &&
            (f as { object_type_id?: string }).object_type_id
        )
        .map((f) => (f as { object_type_id: string }).object_type_id),
    [extractionSchemaFields]
  );
  const allObjectTypeIds = useMemo(
    () => [...new Set([...labelConfig.map((l) => l.object_type_id), ...extractionObjectTypeIds])],
    [labelConfig, extractionObjectTypeIds]
  );
  const allObjectTypeIdsKey = useMemo(() => allObjectTypeIds.join(','), [allObjectTypeIds]);

  useEffect(() => {
    const uniqueIds = allObjectTypeIdsKey ? allObjectTypeIdsKey.split(',').filter(Boolean) : [];
    if (uniqueIds.length === 0) {
      setLabelObjectTypes({});
      setLabelInstances({});
      return;
    }
    let cancelled = false;
    const load = async () => {
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
  }, [document?.channel_id, allObjectTypeIdsKey]);

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
      const fileType = document.file_type.toUpperCase();
      const isStructuredNonVlm = fileType === 'XLSX' || fileType === 'XMIND';
      await createJob({
        document_id: id,
        ...(isStructuredNonVlm ? {} : { force_reparse: forceFullReparse }),
      });
      toast.success(t('detail.toastProcessJob'));
      const updated = await fetchDocumentById(id);
      setDocument(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('detail.toastProcessJobFail'));
    } finally {
      setProcessing(false);
    }
  }, [id, document, forceFullReparse, t]);

  const handleReset = useCallback(async () => {
    if (!id || !document) return;
    setResetting(true);
    try {
      const updated = await resetDocumentStatus(id);
      setDocument(updated);
      toast.success(t('detail.toastStatusReset'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('detail.toastStatusResetFail'));
    } finally {
      setResetting(false);
    }
  }, [id, document, t]);

  const handleExtract = useCallback(async () => {
    if (!id || !document) return;
    setExtracting(true);
    setExtractWarnings([]);
    try {
      const result = await extractDocumentMetadata(id);
      setDocument(result.document);
      setExtractWarnings(result.warnings ?? []);
      toast.success(t('detail.toastMetadataExtracted'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('detail.toastExtractFail'));
    } finally {
      setExtracting(false);
    }
  }, [id, document, t]);

  const handleSaveMarkdown = useCallback(async () => {
    if (!id || markdown === null) return;
    setSaving(true);
    try {
      const updated = await updateDocumentMarkdown(id, markdown);
      setDocument(updated);
      setMarkdown(updated.markdown ?? '');
      setMarkdownEditMode(false);
      setPageIndexRefreshKey((k) => k + 1);
      toast.success(t('detail.toastMarkdownSaved'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('detail.toastMarkdownSaveFail'));
    } finally {
      setSaving(false);
    }
  }, [id, markdown, t]);

  const handleRestoreMarkdown = useCallback(async () => {
    if (!id) return;
    if (!window.confirm(t('detail.confirmRestoreMarkdown'))) return;
    setRestoring(true);
    try {
      const updated = await restoreDocumentMarkdown(id);
      setDocument(updated);
      setMarkdown(updated.markdown ?? '');
      setMarkdownEditMode(false);
      setPageIndexRefreshKey((k) => k + 1);
      toast.success(t('detail.toastMarkdownRestored'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('detail.toastRestoreFail'));
    } finally {
      setRestoring(false);
    }
  }, [id, t]);

  const handleRebuildPageIndex = useCallback(async () => {
    if (!id) return;
    setPageIndexRebuilding(true);
    try {
      const data = await rebuildPageIndex(id);
      setPageIndex(data);
      setPageIndexError(null);
      toast.success(t('detail.toastPageIndex'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('detail.toastPageIndexFail'));
    } finally {
      setPageIndexRebuilding(false);
    }
  }, [id, t]);

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
      toast.success(t('detail.toastDocInfoSaved'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('detail.toastSaveFail'));
    } finally {
      setSavingInfo(false);
    }
  }, [id, document, editName, t]);

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
      toast.success(t('detail.toastMetadataSaved'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('detail.toastMetadataSaveFail'));
    } finally {
      setSavingMetadata(false);
    }
  }, [id, editMeta, t]);

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
      toast.success(t('detail.toastLifecycleSaved'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('detail.toastSaveFail'));
    } finally {
      setLifecycleSaving(false);
    }
  }, [id, editSeriesId, editLifecycleStatus, editEffectiveFrom, editEffectiveTo, t]);

  const handleAddRelationship = useCallback(async () => {
    if (!id || !newRelTarget.trim()) {
      toast.error(t('detail.toastTargetIdRequired'));
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
      toast.success(t('detail.toastRelationshipAdded'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('detail.toastRelationshipAddFail'));
    } finally {
      setRelSaving(false);
    }
  }, [id, newRelTarget, newRelType, newRelNote, refreshLineage, t]);

  const handleDeleteRelationship = useCallback(
    async (relationshipId: string) => {
      if (!id) return;
      try {
        await deleteDocumentRelationship(id, relationshipId);
        await refreshLineage();
        toast.success(t('detail.toastRemoved'));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('detail.toastRemoveFail'));
      }
    },
    [id, refreshLineage, t]
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
      toast.error(e instanceof Error ? e.message : t('detail.toastVersionsLoadFail'));
      setVersionsItems([]);
    } finally {
      setVersionsLoading(false);
    }
  }, [id, t]);

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
      toast.success(t('detail.toastVersionSaved'));
      setSaveVersionModalOpen(false);
      setSaveVersionTag('');
      if (versionsModalOpen) {
        const { items } = await listDocumentVersions(id);
        setVersionsItems(items);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('detail.toastVersionSaveFail'));
    } finally {
      setSaveVersionSubmitting(false);
    }
  }, [id, saveVersionTag, versionsModalOpen, t]);

  const handlePreviewVersion = useCallback(async (vid: string) => {
    if (!id) return;
    setVersionPreviewLoading(true);
    setVersionPreview(null);
    try {
      const detail = await getDocumentVersion(id, vid);
      setVersionPreview(detail);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('detail.toastVersionLoadFail'));
    } finally {
      setVersionPreviewLoading(false);
    }
  }, [id, t]);

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
      toast.success(t('detail.toastVersionRestored'));
      if (versionsModalOpen) {
        const { items } = await listDocumentVersions(id);
        setVersionsItems(items);
      }
      await refreshLatestVersionSnapshot();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('detail.toastVersionRestoreFail'));
    } finally {
      setRestoreSubmitting(false);
    }
  }, [id, restoreModalVersion, restoreSaveCurrent, restoreLabel, restoreNote, versionsModalOpen, metaKeys, refreshLatestVersionSnapshot, t]);

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
        <span>{t('common.backToDocuments')}</span>
      </Link>
      {loading ? (
        <div className="document-detail-loading">{t('detail.loadingShort')}</div>
      ) : (
        <>
          {document && !extendedPanel && (
            <DocumentDetailInfoPanel
              document={document}
              docConfig={docConfig}
              infoVisible={infoVisible}
              showMetadataSection={showMetadataSection}
              infoEditMode={infoEditMode}
              editName={editName}
              savingInfo={savingInfo}
              fileHash={fileHash}
              markdown={markdown}
              processing={processing}
              forceFullReparse={forceFullReparse}
              resetting={resetting}
              versionSnapshotLoading={versionSnapshotLoading}
              latestVersionSnapshot={latestVersionSnapshot}
              showSaveVersionButton={showSaveVersionButton}
              metaKeys={metaKeys}
              extractionSchemaFields={extractionSchemaFields}
              labelConfig={labelConfig}
              metadataEditMode={metadataEditMode}
              editMeta={editMeta}
              savingMetadata={savingMetadata}
              extractWarnings={extractWarnings}
              extracting={extracting}
              hasExtractionModel={hasExtractionModel}
              meta={meta}
              labelKeysSet={labelKeysSet}
              labelInstances={labelInstances}
              lineageSectionOpen={lineageSectionOpen}
              lineageLoading={lineageLoading}
              lineageRels={lineageRels}
              lifecycleEdit={lifecycleEdit}
              editSeriesId={editSeriesId}
              editLifecycleStatus={editLifecycleStatus}
              editEffectiveFrom={editEffectiveFrom}
              editEffectiveTo={editEffectiveTo}
              lifecycleSaving={lifecycleSaving}
              newRelTarget={newRelTarget}
              newRelType={newRelType}
              newRelNote={newRelNote}
              relSaving={relSaving}
              onToggleInfo={() => setInfoVisible((v) => !v)}
              onEditNameChange={setEditName}
              onSaveInfo={handleSaveInfo}
              onCancelInfoEdit={handleCancelInfoEdit}
              onEnterInfoEdit={handleEnterInfoEdit}
              onProcess={handleProcess}
              onForceFullReparseChange={setForceFullReparse}
              onReset={handleReset}
              onOpenVersionsModal={handleOpenVersionsModal}
              onOpenSaveVersion={() => {
                setSaveVersionTag('');
                setSaveVersionModalOpen(true);
              }}
              onEnterMetadataEdit={handleEnterMetadataEdit}
              onSetEditMetaField={setEditMetaField}
              onSaveMetadata={handleSaveMetadata}
              onCancelMetadataEdit={handleCancelMetadataEdit}
              onExtract={handleExtract}
              getInstanceDisplay={getInstanceDisplay}
              onToggleLineageSection={() => setLineageSectionOpen((o) => !o)}
              onSetLifecycleEdit={setLifecycleEdit}
              onSaveLifecycle={() => void handleSaveLifecycle()}
              onSetEditLifecycleStatus={setEditLifecycleStatus}
              onSetEditSeriesId={setEditSeriesId}
              onSetEditEffectiveFrom={setEditEffectiveFrom}
              onSetEditEffectiveTo={setEditEffectiveTo}
              onSetNewRelType={setNewRelType}
              onSetNewRelTarget={setNewRelTarget}
              onSetNewRelNote={setNewRelNote}
              onAddRelationship={() => void handleAddRelationship()}
              onDeleteRelationship={(relationshipId) => void handleDeleteRelationship(relationshipId)}
            />
          )}
          {error ? (
            <div className="document-detail-error">{error}</div>
          ) : (
        <>
        <DocumentDetailSplitPanel
          extendedPanel={extendedPanel}
          isSpreadsheetLayout={isSpreadsheetLayout}
          isMindmapLayout={isMindmapLayout}
          isStructuredNonVlmLayout={isStructuredNonVlmLayout}
          parsingResult={parsingResult}
          spreadsheetSheets={spreadsheetSheets}
          spreadsheetSheetIndex={spreadsheetSheetIndex}
          onSpreadsheetSheetIndex={setSpreadsheetSheetIndex}
          activeSpreadsheetSheet={activeSpreadsheetSheet}
          mindmapSheets={mindmapSheets}
          mindmapAttachments={mindmapAttachments}
          deferLargeDocImages={deferLargeDocImages}
          pageImageItems={pageImageItems}
          pageBlocks={pageBlocks}
          pageDimensions={pageDimensions}
          hoveredBlockKey={hoveredBlockKey}
          selectedBlock={selectedBlock}
          onHoveredBlockKey={setHoveredBlockKey}
          onSelectedBlock={setSelectedBlock}
          onPageMouseMove={handlePageMouseMove}
          onPageImageLoad={onPageImageLoad}
          getImageUrl={getImageUrl}
          folderId={folderId}
          onLoadDeferredImages={handleLoadDeferredImages}
          onToggleImagesPanel={handleToggleImagesPanel}
          rightPanelView={rightPanelView}
          onRightPanelView={setRightPanelView}
          markdownEditMode={markdownEditMode}
          onMarkdownEditMode={setMarkdownEditMode}
          markdown={markdown}
          onMarkdownChange={setMarkdown}
          document={document}
          docConfig={docConfig}
          showPrintButton={showPrintButton}
          saving={saving}
          onSaveMarkdown={handleSaveMarkdown}
          onCancelMarkdownEdit={() => {
            setMarkdown(document?.markdown ?? '');
            setMarkdownEditMode(false);
          }}
          onEnterMarkdownEdit={() => {
            setSelectedBlock(null);
            setMarkdownEditMode(true);
          }}
          onRebuildPageIndex={handleRebuildPageIndex}
          pageIndexRebuilding={pageIndexRebuilding}
          pageIndex={pageIndex}
          pageIndexLoading={pageIndexLoading}
          pageIndexError={pageIndexError}
          markdownComponents={markdownComponents}
          restoring={restoring}
          fileHash={fileHash}
          onRestoreMarkdown={handleRestoreMarkdown}
          markdownBaseUrl={markdownBaseUrl}
          onToggleMarkdownExtend={() => setExtendedPanel((p) => (p === 'markdown' ? null : 'markdown'))}
        />
        {!docConfig && id && (
          <DocumentDetailVersionModals
            saveVersionModalOpen={saveVersionModalOpen}
            saveVersionTag={saveVersionTag}
            saveVersionSubmitting={saveVersionSubmitting}
            onSaveVersionTagChange={setSaveVersionTag}
            onCloseSaveVersion={() => setSaveVersionModalOpen(false)}
            onCreateVersion={handleCreateVersion}
            versionsModalOpen={versionsModalOpen}
            versionsLoading={versionsLoading}
            versionsItems={versionsItems}
            restoreSubmitting={restoreSubmitting}
            onCloseVersions={() => setVersionsModalOpen(false)}
            onPreviewVersion={handlePreviewVersion}
            onOpenRestore={setRestoreModalVersion}
            versionPreview={versionPreview}
            versionPreviewLoading={versionPreviewLoading}
            onCloseVersionPreview={() => setVersionPreview(null)}
            markdownComponents={markdownComponents}
            restoreModalVersion={restoreModalVersion}
            restoreSaveCurrent={restoreSaveCurrent}
            restoreLabel={restoreLabel}
            restoreNote={restoreNote}
            onCloseRestore={() => setRestoreModalVersion(null)}
            onRestoreSaveCurrentChange={setRestoreSaveCurrent}
            onRestoreLabelChange={setRestoreLabel}
            onRestoreNoteChange={setRestoreNote}
            onConfirmRestore={handleConfirmRestore}
          />
        )}
        </>
          )}
        </>
      )}
    </div>
  );
}
