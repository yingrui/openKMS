import { useCallback, useEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import {
  fetchAllKBDocuments,
  fetchKBDocuments,
  addKBDocument,
  removeKBDocument,
  type KBDocumentResponse,
} from '../../../../data/knowledgeBasesApi';
import { fetchDocuments, type DocumentListItemResponse } from '../../../../data/documentsApi';
import type { ChannelNode } from '../../../../data/channelsApi';

/**
 * The documents tab and the picker that fills it.
 *
 * The picker is the reason this is one hook and not two: adding a document means paging the channel tree,
 * searching inside it, and keeping the "already linked" set — and that set is also what the tab's remove
 * button edits. Splitting them would have meant two copies of `linkedDocIds`, which is how a row shows a
 * remove button after it is already gone.
 */
export function useKbDocuments({
  kbId,
  channels,
  loadKb,
  t,
}: {
  kbId: string | undefined;
  /** The channel tree the picker browses. */
  channels: ChannelNode[];
  loadKb: () => void;
  t: TFunction;
}) {
  // Documents
  const [docs, setDocs] = useState<KBDocumentResponse[]>([]);
  const [docTotal, setDocTotal] = useState(0);
  const [docPage, setDocPage] = useState(0);
  const [docPageSize, setDocPageSize] = useState(50);
  const [linkedDocIds, setLinkedDocIds] = useState<Set<string>>(new Set());
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerResults, setPickerResults] = useState<DocumentListItemResponse[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set());
  const [pickerSelectedChannel, setPickerSelectedChannel] = useState<string | null>(null);
  const [pickerChannelExpanded, setPickerChannelExpanded] = useState<Record<string, boolean>>({});
  const [pickerSearchDebounced, setPickerSearchDebounced] = useState('');
  const [pickerPage, setPickerPage] = useState(0);
  const [pickerPageSize] = useState(20);
  const [pickerTotal, setPickerTotal] = useState(0);
  const [pickerAdding, setPickerAdding] = useState(false);
  const pickerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  const refreshLinkedDocIds = useCallback(async () => {
    if (!kbId) return;
    try {
      const all = await fetchAllKBDocuments(kbId);
      setLinkedDocIds(new Set(all.map((d) => d.document_id)));
    } catch { /* noop */ }
  }, [kbId]);

  const loadDocs = useCallback(async () => {
    if (!kbId) return;
    try {
      const data = await fetchKBDocuments(kbId, { offset: docPage * docPageSize, limit: docPageSize });
      setDocs(data.items);
      setDocTotal(data.total);
      setDocPage((p) => {
        const maxP = data.total > 0 ? Math.ceil(data.total / docPageSize) - 1 : 0;
        return Math.min(p, Math.max(0, maxP));
      });
    } catch { /* noop */ }
  }, [kbId, docPage, docPageSize]);



  const openDocPicker = async () => {
    setShowDocPicker(true);
    setPickerSearch('');
    setPickerSearchDebounced('');
    setPickerSelected(new Set());
    setPickerSelectedChannel(null);
    setPickerPage(0);
    setPickerResults([]);
    setPickerTotal(0);
    setPickerLoading(false);
    setPickerChannelExpanded(
      channels.reduce<Record<string, boolean>>((acc, ch) => {
        if (ch.children?.length) acc[ch.id] = true;
        return acc;
      }, {})
    );
  };

  const handlePickerChannelSelect = (channelId: string) => {
    setPickerSelectedChannel(channelId);
    setPickerPage(0);
  };

  const handlePickerChannelToggle = (channelId: string) => {
    setPickerChannelExpanded((prev) => ({ ...prev, [channelId]: !prev[channelId] }));
  };

  const loadPickerDocuments = useCallback(async () => {
    if (!pickerSelectedChannel) {
      setPickerResults([]);
      setPickerTotal(0);
      return;
    }
    setPickerLoading(true);
    try {
      const res = await fetchDocuments({
        channel_id: pickerSelectedChannel,
        search: pickerSearchDebounced || undefined,
        offset: pickerPage * pickerPageSize,
        limit: pickerPageSize,
      });
      setPickerResults(res.items);
      setPickerTotal(res.total);
    } catch { /* noop */ }
    finally { setPickerLoading(false); }
  }, [pickerSelectedChannel, pickerSearchDebounced, pickerPage, pickerPageSize]);

  useEffect(() => {
    if (showDocPicker && pickerSelectedChannel) {
      loadPickerDocuments();
    } else if (showDocPicker && !pickerSelectedChannel) {
      setPickerResults([]);
      setPickerTotal(0);
    }
  }, [showDocPicker, pickerSelectedChannel, loadPickerDocuments]);

  const handlePickerSearch = (query: string) => {
    setPickerSearch(query);
    if (pickerDebounceRef.current) clearTimeout(pickerDebounceRef.current);
    pickerDebounceRef.current = setTimeout(() => {
      setPickerSearchDebounced(query);
      setPickerPage(0);
    }, 300);
  };

  const pickerTotalPages = Math.ceil(pickerTotal / pickerPageSize) || 1;
  const pickerCanPrev = pickerPage > 0;
  const pickerCanNext = pickerPage < pickerTotalPages - 1;

  const togglePickerDoc = (docId: string) => {
    setPickerSelected((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const handleAddSelectedDocuments = async () => {
    if (!kbId || pickerSelected.size === 0) return;
    setPickerAdding(true);
    let added = 0;
    for (const docId of pickerSelected) {
      try {
        await addKBDocument(kbId, docId);
        added++;
      } catch { /* skip duplicates */ }
    }
    setPickerAdding(false);
    setShowDocPicker(false);
    if (added > 0) {
      toast.success(t('detail.toastDocumentsAdded', { count: added }));
      void loadDocs();
      void refreshLinkedDocIds();
      loadKb();
    }
  };

  const closeDocPicker = () => {
    if (!pickerAdding) {
      setShowDocPicker(false);
    }
  };

  const handleRemoveDocument = async (docId: string) => {
    if (!kbId) return;
    try {
      await removeKBDocument(kbId, docId);
      toast.success(t('detail.toastDocRemoved'));
      void loadDocs();
      void refreshLinkedDocIds();
      loadKb();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastRemoveDocFailed'));
    }
  };


  return {
    docs,
    docTotal,
    docPage,
    setDocPage,
    docPageSize,
    setDocPageSize,
    linkedDocIds,
    alreadyAddedIds: linkedDocIds,
    setLinkedDocIds,
    showDocPicker,
    setShowDocPicker,
    pickerSearch,
    pickerResults,
    pickerLoading,
    pickerSelected,
    pickerSelectedChannel,
    pickerChannelExpanded,
    pickerPage,
    setPickerPage,
    pickerPageSize,
    pickerTotal,
    pickerAdding,
    loadDocs,
    refreshLinkedDocIds,
    openDocPicker,
    closeDocPicker,
    handlePickerSearch,
    handlePickerChannelSelect,
    handlePickerChannelToggle,
    handleAddSelectedDocuments,
    handleRemoveDocument,
    togglePickerDoc,
    pickerTotalPages,
    pickerCanPrev,
    pickerCanNext,
  };
}
