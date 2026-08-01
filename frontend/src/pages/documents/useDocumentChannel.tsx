import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useEnsureDocumentChannels } from '../../contexts/DocumentChannelsContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useListFetch } from '../../hooks/useListFetch';
import {
  getDocumentChannelName,
  getDocumentChannelDescription,
  flattenChannels,
  findChannel,
  canQueueDocumentProcess,
  isProcessBlockedByMissingPipeline,
} from '../../data/channelUtils';
import {
  fetchDocumentsByChannel,
  uploadDocument,
  deleteDocument,
  updateDocument,
  resetDocumentStatus,
  downloadDocumentOriginal,
  isAcceptedFile,
  type DocumentListItemResponse,
} from '../../data/documentsApi';
import { createJob } from '../../data/jobsApi';

const DOCS_PAGE_SIZE_DEFAULT = 25;

export const DOCUMENT_STATUS_FILTER_VALUES = [
  '',
  'uploaded',
  'pending',
  'running',
  'completed',
  'failed',
] as const;

export type DocumentStatusFilter = (typeof DOCUMENT_STATUS_FILTER_VALUES)[number];

export const APPLICABLE_FILTER_VALUES = ['', 'yes', 'no'] as const;
export type ApplicableFilter = (typeof APPLICABLE_FILTER_VALUES)[number];

export function useDocumentChannel(channelId: string) {
  const { t } = useTranslation('documents');
  const { channels, loading, error, refetch: refetchChannels } = useEnsureDocumentChannels();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();

  const formatSize = useCallback(
    (bytes: number) => {
      if (bytes < 1024) return t('channel.sizeB', { n: bytes });
      if (bytes < 1024 * 1024) return t('channel.sizeKB', { n: (bytes / 1024).toFixed(1) });
      return t('channel.sizeMB', { n: (bytes / (1024 * 1024)).toFixed(1) });
    },
    [t],
  );

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(() => new Set());
  const [moveModalDocIds, setMoveModalDocIds] = useState<string[] | null>(null);
  const [moveTargetChannelId, setMoveTargetChannelId] = useState('');
  const [moveLoading, setMoveLoading] = useState(false);
  const [bulkBusy, setBulkBusy] = useState<'delete' | 'process' | 'move' | 'reset' | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [statusFilter, setStatusFilter] = useState<DocumentStatusFilter>('');
  const [applicableFilter, setApplicableFilter] = useState<ApplicableFilter>('');

  const channelIds = useMemo(() => new Set(flattenChannels(channels).map((c) => c.id)), [channels]);
  const channelName = getDocumentChannelName(channels, channelId);
  const channelOptions = flattenChannels(channels);
  const channelDescription = getDocumentChannelDescription(channels, channelId);
  const currentChannel = useMemo(() => findChannel(channels, channelId), [channels, channelId]);
  const channelPipelineId = currentChannel?.pipeline_id;

  const docsFilters = useMemo(
    () => ({ channelId, search: debouncedSearch, status: statusFilter, applicable: applicableFilter }),
    [channelId, debouncedSearch, statusFilter, applicableFilter],
  );

  const {
    items: documents,
    total: docsTotal,
    page: docsPage,
    setPage: setDocsPage,
    pageSize: docsPageSize,
    setPageSize: setDocsPageSize,
    loading: docsLoading,
    error: docsFetchError,
    reload: loadDocuments,
  } = useListFetch({
    fetcher: async ({ offset, limit, channelId, search, status, applicable }) => {
      if (!channelId) return { items: [], total: 0 };
      const res = await fetchDocumentsByChannel(channelId, {
        search: search || undefined,
        status: status || undefined,
        applicable: applicable === 'yes' ? true : applicable === 'no' ? false : undefined,
        offset,
        limit,
      });
      return { items: res.items, total: res.total };
    },
    filters: docsFilters,
    pageSize: DOCS_PAGE_SIZE_DEFAULT,
  });

  const docsError = docsFetchError ? docsFetchError.message || t('channel.loadDocsFailed') : null;

  useEffect(() => {
    setSelectedDocIds(new Set());
  }, [channelId, debouncedSearch, statusFilter, applicableFilter]);

  useEffect(() => {
    if (docsTotal === 0) return;
    const maxPage = Math.max(0, Math.ceil(docsTotal / docsPageSize) - 1);
    if (docsPage > maxPage) setDocsPage(maxPage);
  }, [docsTotal, docsPageSize, docsPage, setDocsPage]);

  const selectedCount = selectedDocIds.size;
  const allDocsSelected = documents.length > 0 && documents.every((d) => selectedDocIds.has(d.id));
  const someDocsSelected = selectedCount > 0 && !allDocsSelected;

  const selectedDocs = useMemo(
    () => documents.filter((d) => selectedDocIds.has(d.id)),
    [documents, selectedDocIds],
  );

  const selectedProcessableDocs = useMemo(
    () => selectedDocs.filter((d) => d.status === 'uploaded' || d.status === 'failed'),
    [selectedDocs],
  );

  const selectedRunnableDocs = useMemo(
    () =>
      selectedProcessableDocs.filter((d) =>
        canQueueDocumentProcess(d.status ?? '', d.file_type, channelPipelineId),
      ),
    [selectedProcessableDocs, channelPipelineId],
  );

  const selectedResettableDocs = useMemo(
    () => selectedDocs.filter((d) => d.status && d.status !== 'uploaded'),
    [selectedDocs],
  );

  const bulkProcessBlockedByPipeline = useMemo(
    () =>
      selectedProcessableDocs.length > 0 &&
      selectedRunnableDocs.length === 0 &&
      selectedProcessableDocs.some((d) =>
        isProcessBlockedByMissingPipeline(d.file_type, channelPipelineId),
      ),
    [selectedProcessableDocs, selectedRunnableDocs, channelPipelineId],
  );

  const moveModalDocs = useMemo(() => {
    if (!moveModalDocIds?.length) return [];
    const idSet = new Set(moveModalDocIds);
    return documents.filter((d) => idSet.has(d.id));
  }, [documents, moveModalDocIds]);

  const toggleDocSelection = useCallback((docId: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allDocsSelected) {
      setSelectedDocIds(new Set());
      return;
    }
    setSelectedDocIds(new Set(documents.map((d) => d.id)));
  }, [allDocsSelected, documents]);

  const clearSelection = useCallback(() => {
    setSelectedDocIds(new Set());
  }, []);

  const handleUploadClick = useCallback(() => {
    setUploadError(null);
    setSelectedFiles([]);
    setShowUploadModal(true);
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      const accepted = files.filter((f) => isAcceptedFile(f));
      if (accepted.length !== files.length) {
        setUploadError(t('channel.filesSkipped'));
      }
      setSelectedFiles(accepted);
      e.target.value = '';
    },
    [t],
  );

  const removeFile = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addDroppedFiles = useCallback((files: File[]) => {
    setSelectedFiles((prev) => [...prev, ...files.filter((f) => isAcceptedFile(f))]);
  }, []);

  const handleUploadSubmit = useCallback(async () => {
    if (selectedFiles.length === 0 || !channelId) return;
    const count = selectedFiles.length;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of selectedFiles) {
        await uploadDocument(channelId, file);
      }
      setSelectedFiles([]);
      setShowUploadModal(false);
      toast.success(t('channel.uploadToast', { count }));
      await loadDocuments();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : t('channel.uploadFailed'));
    } finally {
      setUploading(false);
    }
  }, [selectedFiles, channelId, t, loadDocuments]);

  const closeUploadModal = useCallback(() => {
    if (!uploading) {
      setShowUploadModal(false);
      setUploadError(null);
      setSelectedFiles([]);
    }
  }, [uploading]);

  const handleDeleteClick = useCallback(
    async (e: React.MouseEvent, doc: DocumentListItemResponse) => {
      e.stopPropagation();
      if (
        !(await confirm({
          title: t('common.delete'),
          message: t('channel.deleteConfirm', { name: doc.name }),
          confirmLabel: t('common.delete'),
          danger: true,
        }))
      )
        return;
      setDeletingId(doc.id);
      try {
        await deleteDocument(doc.id);
        toast.success(t('channel.deletedToast', { name: doc.name }));
        await loadDocuments();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('channel.deleteFailed'));
      } finally {
        setDeletingId(null);
      }
    },
    [confirm, t, loadDocuments],
  );

  const handleProcessClick = useCallback(
    async (e: React.MouseEvent, doc: DocumentListItemResponse) => {
      e.stopPropagation();
      if (!canQueueDocumentProcess(doc.status ?? '', doc.file_type, channelPipelineId)) return;
      setProcessingId(doc.id);
      try {
        await createJob({ document_id: doc.id });
        toast.success(t('channel.processJobCreated'));
        await loadDocuments();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('channel.processJobFailed'));
      } finally {
        setProcessingId(null);
      }
    },
    [channelPipelineId, t, loadDocuments],
  );

  const handleDownloadClick = useCallback(
    async (e: React.MouseEvent, doc: DocumentListItemResponse) => {
      e.stopPropagation();
      try {
        await downloadDocumentOriginal(doc);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('channel.downloadFailed'));
      }
    },
    [t],
  );

  const openMoveModal = useCallback(
    (docIds: string[]) => {
      if (docIds.length === 0) return;
      const first = documents.find((d) => d.id === docIds[0]);
      setMoveModalDocIds(docIds);
      setMoveTargetChannelId(first?.channel_id ?? channelId);
    },
    [documents, channelId],
  );

  const handleMoveClick = useCallback(
    (e: React.MouseEvent, doc: DocumentListItemResponse) => {
      e.stopPropagation();
      openMoveModal([doc.id]);
    },
    [openMoveModal],
  );

  const closeMoveModal = useCallback(() => {
    if (!moveLoading && !bulkBusy) {
      setMoveModalDocIds(null);
      setMoveTargetChannelId('');
    }
  }, [moveLoading, bulkBusy]);

  const handleMoveConfirm = useCallback(async () => {
    if (!moveModalDocIds?.length || !moveTargetChannelId) {
      closeMoveModal();
      return;
    }
    const toMove = moveModalDocs.filter((d) => d.channel_id !== moveTargetChannelId);
    if (toMove.length === 0) {
      closeMoveModal();
      return;
    }
    const isBulk = moveModalDocIds.length > 1;
    setMoveLoading(true);
    if (isBulk) setBulkBusy('move');
    try {
      let ok = 0;
      for (const doc of toMove) {
        await updateDocument(doc.id, { channel_id: moveTargetChannelId });
        ok += 1;
      }
      if (ok === toMove.length) {
        toast.success(
          isBulk && ok > 1
            ? t('channel.movedBulkToast', { count: ok })
            : t('channel.movedToast', { name: toMove[0].name }),
        );
      } else {
        toast.success(t('channel.moveBulkPartial', { ok, total: toMove.length }));
      }
      setSelectedDocIds((prev) => {
        const next = new Set(prev);
        toMove.forEach((d) => next.delete(d.id));
        return next;
      });
      await loadDocuments();
      if (refetchChannels) await refetchChannels();
      closeMoveModal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('channel.moveFailed'));
    } finally {
      setMoveLoading(false);
      setBulkBusy(null);
    }
  }, [moveModalDocIds, moveTargetChannelId, moveModalDocs, t, loadDocuments, refetchChannels, closeMoveModal]);

  const handleBulkDelete = useCallback(async () => {
    const ids = [...selectedDocIds];
    if (ids.length === 0) return;
    if (
      !(await confirm({
        title: t('common.delete'),
        message: t('channel.deleteBulkConfirm', { count: ids.length }),
        confirmLabel: t('common.delete'),
        danger: true,
      }))
    )
      return;
    setBulkBusy('delete');
    let ok = 0;
    try {
      for (const docId of ids) {
        try {
          await deleteDocument(docId);
          ok += 1;
        } catch {
          /* continue with remaining */
        }
      }
      if (ok === ids.length) {
        toast.success(t('channel.deletedBulkToast', { count: ok }));
      } else if (ok > 0) {
        toast.success(t('channel.deleteBulkPartial', { ok, total: ids.length }));
      } else {
        toast.error(t('channel.deleteFailed'));
      }
      clearSelection();
      await loadDocuments();
    } finally {
      setBulkBusy(null);
    }
  }, [selectedDocIds, confirm, t, clearSelection, loadDocuments]);

  const handleBulkProcess = useCallback(async () => {
    const docs = selectedRunnableDocs;
    if (docs.length === 0) {
      toast.error(
        bulkProcessBlockedByPipeline ? t('channel.processBulkNoPipeline') : t('channel.processBulkNone'),
      );
      return;
    }
    setBulkBusy('process');
    let ok = 0;
    try {
      for (const doc of docs) {
        try {
          await createJob({ document_id: doc.id });
          ok += 1;
        } catch {
          /* continue */
        }
      }
      const skipped = selectedCount - docs.length;
      if (ok === docs.length && skipped === 0) {
        toast.success(t('channel.processBulkToast', { count: ok }));
      } else if (ok > 0) {
        toast.success(t('channel.processBulkPartial', { ok, skipped }));
      } else {
        toast.error(t('channel.processJobFailed'));
      }
      await loadDocuments();
    } finally {
      setBulkBusy(null);
    }
  }, [selectedRunnableDocs, bulkProcessBlockedByPipeline, t, selectedCount, loadDocuments]);

  const handleBulkMoveClick = useCallback(() => {
    openMoveModal([...selectedDocIds]);
  }, [openMoveModal, selectedDocIds]);

  const handleBulkResetStatus = useCallback(async () => {
    const docs = selectedResettableDocs;
    if (docs.length === 0) {
      toast.error(t('channel.resetBulkNone'));
      return;
    }
    if (
      !(await confirm({
        title: t('common.reset'),
        message: t('channel.resetBulkConfirm', { count: docs.length }),
        confirmLabel: t('common.reset'),
        danger: true,
      }))
    )
      return;
    setBulkBusy('reset');
    let ok = 0;
    try {
      for (const doc of docs) {
        try {
          await resetDocumentStatus(doc.id);
          ok += 1;
        } catch {
          /* continue with remaining */
        }
      }
      const skipped = selectedCount - docs.length;
      if (ok === docs.length && skipped === 0) {
        toast.success(t('channel.resetBulkToast', { count: ok }));
      } else if (ok > 0) {
        toast.success(t('channel.resetBulkPartial', { ok, skipped, total: docs.length }));
      } else {
        toast.error(t('channel.resetBulkFailed'));
      }
      clearSelection();
      await loadDocuments();
    } finally {
      setBulkBusy(null);
    }
  }, [selectedResettableDocs, confirm, t, selectedCount, clearSelection, loadDocuments]);

  const bulkActionsDisabled = bulkBusy !== null || moveLoading;

  const bulkProcessDisabled = bulkActionsDisabled || selectedRunnableDocs.length === 0;
  const bulkProcessTitle = bulkProcessBlockedByPipeline
    ? t('channel.processBulkNoPipeline')
    : selectedRunnableDocs.length === 0
      ? t('channel.processBulkNone')
      : t('channel.bulkProcess');

  const bulkResetDisabled = bulkActionsDisabled || selectedResettableDocs.length === 0;
  const bulkResetTitle =
    selectedResettableDocs.length === 0
      ? t('channel.resetBulkNone')
      : t('channel.titleBulkResetStatus');

  const statusFilterLabel = useCallback(
    (value: DocumentStatusFilter) => {
      switch (value) {
        case '':
          return t('channel.filterAllStatus');
        case 'uploaded':
          return t('channel.filterStatusUploaded');
        case 'pending':
          return t('channel.filterStatusPending');
        case 'running':
          return t('channel.filterStatusRunning');
        case 'completed':
          return t('channel.filterStatusCompleted');
        case 'failed':
          return t('channel.filterStatusFailed');
        default:
          return value;
      }
    },
    [t],
  );

  const applicableFilterLabel = useCallback(
    (value: ApplicableFilter) => {
      switch (value) {
        case '':
          return t('channel.filterAllApplicable');
        case 'yes':
          return t('channel.filterApplicableYes');
        case 'no':
          return t('channel.filterApplicableNo');
        default:
          return value;
      }
    },
    [t],
  );

  return {
    t,
    channels,
    loading,
    error,
    fileInputRef,
    formatSize,
    uploading,
    uploadError,
    showUploadModal,
    selectedFiles,
    deletingId,
    processingId,
    selectedDocIds,
    moveModalDocIds,
    moveTargetChannelId,
    setMoveTargetChannelId,
    moveLoading,
    bulkBusy,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    applicableFilter,
    setApplicableFilter,
    channelIds,
    channelName,
    channelOptions,
    channelDescription,
    channelPipelineId,
    documents,
    docsTotal,
    docsPage,
    setDocsPage,
    docsPageSize,
    setDocsPageSize,
    docsLoading,
    docsError,
    loadDocuments,
    selectedCount,
    allDocsSelected,
    someDocsSelected,
    selectedRunnableDocs,
    selectedResettableDocs,
    bulkProcessBlockedByPipeline,
    moveModalDocs,
    toggleDocSelection,
    toggleSelectAll,
    clearSelection,
    handleUploadClick,
    handleFileChange,
    removeFile,
    addDroppedFiles,
    handleUploadSubmit,
    closeUploadModal,
    handleDeleteClick,
    handleProcessClick,
    handleDownloadClick,
    handleMoveClick,
    closeMoveModal,
    handleMoveConfirm,
    handleBulkDelete,
    handleBulkProcess,
    handleBulkMoveClick,
    handleBulkResetStatus,
    bulkActionsDisabled,
    bulkProcessDisabled,
    bulkProcessTitle,
    bulkResetDisabled,
    bulkResetTitle,
    statusFilterLabel,
    applicableFilterLabel,
  };
}
