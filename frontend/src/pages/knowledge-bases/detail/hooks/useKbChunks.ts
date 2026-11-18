import { useCallback, useState } from 'react';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import {
  fetchChunkById,
  fetchChunks,
  updateChunk,
  type ChunkResponse,
  type KnowledgeBaseResponse,
} from '../../../../data/knowledgeBasesApi';
import { configValuesToMetadata, objToConfigValues } from '../../KnowledgeBaseDetail.metadataUtils';
import { metadataArrayFlags } from '../faqMetadata';

/**
 * The chunks tab and its dialog: the page of indexed chunks, and editing one.
 *
 * A chunk's content is what the embedding was computed from, so saving a new one clears its vector until
 * the next index run — the dialog says so, and this hook is where the run is kicked off again (the page's
 * `loadKb` re-reads the counts).
 *
 * Which metadata keys are lists is asked of the **document's channel**, not of the knowledge base — the
 * same question the FAQ editor asks, so it is the same helper.
 */
export function useKbChunks({
  kbId,
  kb,
  loadKb,
  t,
}: {
  kbId: string | undefined;
  kb: KnowledgeBaseResponse | null;
  /** Re-read the knowledge base after a save, so its chunk count is not stale. */
  loadKb: () => void;
  t: TFunction;
}) {
  const [chunks, setChunks] = useState<ChunkResponse[]>([]);
  const [chunkTotal, setChunkTotal] = useState(0);
  const [chunkPage, setChunkPage] = useState(0);
  const [chunkPageSize, setChunkPageSize] = useState(50);
  const [editChunk, setEditChunk] = useState<ChunkResponse | null>(null);
  const [showChunkDialog, setShowChunkDialog] = useState(false);
  const [chunkContent, setChunkContent] = useState('');
  const [chunkDocMetadataValues, setChunkDocMetadataValues] = useState<Record<string, string>>({});
  const [chunkMetadataIsArray, setChunkMetadataIsArray] = useState<Record<string, boolean>>({});
  const [chunkSaving, setChunkSaving] = useState(false);
  const [chunkDialogReadOnly, setChunkDialogReadOnly] = useState(false);

  const loadChunks = useCallback(async () => {
    if (!kbId) return;
    try {
      const data = await fetchChunks(kbId, {
        offset: chunkPage * chunkPageSize,
        limit: chunkPageSize,
      });
      setChunks(data.items);
      setChunkTotal(data.total);
      setChunkPage((p) => {
        const maxPage = data.total > 0 ? Math.ceil(data.total / chunkPageSize) - 1 : 0;
        return Math.min(p, Math.max(0, maxPage));
      });
    } catch {
      /* the tab shows the previous page rather than an error for a read that can be retried */
    }
  }, [kbId, chunkPage, chunkPageSize]);

  const openChunkEdit = async (chunk: ChunkResponse, options?: { readOnly?: boolean }) => {
    setChunkDialogReadOnly(options?.readOnly ?? false);
    setEditChunk(chunk);
    setChunkContent(chunk.content);
    setChunkDocMetadataValues(objToConfigValues(chunk.doc_metadata, kb?.metadata_keys ?? undefined));
    setChunkMetadataIsArray(await metadataArrayFlags(chunk.document_id, kb?.metadata_keys));
    setShowChunkDialog(true);
  };

  const openChunkViewFromId = async (chunkId: string) => {
    if (!kbId) return;
    try {
      const chunk = await fetchChunkById(kbId, chunkId);
      await openChunkEdit(chunk, { readOnly: true });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastChunkFailed'));
    }
  };

  const openChunkEditFromId = async (chunkId: string) => {
    if (!kbId) return;
    try {
      const chunk = await fetchChunkById(kbId, chunkId);
      await openChunkEdit(chunk);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastChunkFailed'));
    }
  };

  const closeChunkDialog = () => {
    setShowChunkDialog(false);
    setEditChunk(null);
    setChunkDialogReadOnly(false);
  };

  const handleSaveChunk = async () => {
    if (!kbId || !editChunk) return;
    setChunkSaving(true);
    try {
      const doc_metadata = configValuesToMetadata(
        chunkDocMetadataValues,
        kb?.metadata_keys ?? undefined,
        chunkMetadataIsArray
      );
      await updateChunk(kbId, editChunk.id, {
        content: chunkContent,
        doc_metadata: doc_metadata ?? undefined,
      });
      toast.success(t('detail.toastChunkUpdated'));
      closeChunkDialog();
      void loadChunks();
      loadKb();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastChunkFailed'));
    } finally {
      setChunkSaving(false);
    }
  };

  return {
    chunks,
    setChunks,
    chunkTotal,
    setChunkTotal,
    chunkPage,
    setChunkPage,
    chunkPageSize,
    setChunkPageSize,
    editChunk,
    showChunkDialog,
    chunkContent,
    setChunkContent,
    chunkDocMetadataValues,
    setChunkDocMetadataValues,
    chunkMetadataIsArray,
    chunkSaving,
    chunkDialogReadOnly,
    loadChunks,
    openChunkEdit,
    openChunkViewFromId,
    openChunkEditFromId,
    closeChunkDialog,
    handleSaveChunk,
  };
}
