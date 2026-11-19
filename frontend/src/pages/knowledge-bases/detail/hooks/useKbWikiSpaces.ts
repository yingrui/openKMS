import { useCallback, useState } from 'react';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import {
  addKBWikiSpace,
  enqueueKnowledgeBaseWikiSpaceIndexJob,
  fetchKBWikiSpaces,
  removeKBWikiSpace,
  type KBWikiSpaceResponse,
  type KnowledgeBaseResponse,
} from '../../../../data/knowledgeBasesApi';
import { fetchAllWikiSpaces, type WikiSpaceResponse } from '../../../../data/wikiSpacesApi';

/**
 * What the base indexes: its wiki spaces, the picker that links one, and the per-space re-index job.
 *
 * Linking is a write to the knowledge base; it ends in `loadKb` because the header counts move.
 */
export function useKbWikiSpaces({
  kbId,
  kb,
  loadKb,
  t,
}: {
  kbId: string | undefined;
  /** Read-only: a wiki-space re-index needs an embedding model, and that is the knowledge base's setting. */
  kb: KnowledgeBaseResponse | null;
  loadKb: () => void;
  t: TFunction;
}) {
  const [kbWikiSpaces, setKbWikiSpaces] = useState<KBWikiSpaceResponse[]>([]);
  const [showWikiSpacePicker, setShowWikiSpacePicker] = useState(false);
  const [wikiSpacePickerItems, setWikiSpacePickerItems] = useState<WikiSpaceResponse[]>([]);
  const [wikiSpacePickerLoading, setWikiSpacePickerLoading] = useState(false);
  const [wikiSpaceBusyId, setWikiSpaceBusyId] = useState<string | null>(null);

  const loadKbWikiSpaces = useCallback(async () => {
    if (!kbId) return;
    try {
      setKbWikiSpaces(await fetchKBWikiSpaces(kbId));
    } catch { /* noop */ }
  }, [kbId]);

  const openWikiSpacePicker = async () => {
    setShowWikiSpacePicker(true);
    setWikiSpacePickerLoading(true);
    setWikiSpacePickerItems([]);
    try {
      const res = await fetchAllWikiSpaces();
      setWikiSpacePickerItems(res);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastWikiSpacesLoadFailed'));
    } finally {
      setWikiSpacePickerLoading(false);
    }
  };

  const closeWikiSpacePicker = () => {
    if (!wikiSpaceBusyId) setShowWikiSpacePicker(false);
  };

  const handleAddWikiSpaceToKb = async (wikiSpaceId: string) => {
    if (!kbId) return;
    setWikiSpaceBusyId(wikiSpaceId);
    try {
      await addKBWikiSpace(kbId, wikiSpaceId);
      toast.success(t('detail.toastWikiSpaceLinked'));
      await loadKbWikiSpaces();
      await loadKb();
      setShowWikiSpacePicker(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastWikiSpaceLinkFailed'));
    } finally {
      setWikiSpaceBusyId(null);
    }
  };

  const handleRemoveWikiSpaceFromKb = async (wikiSpaceId: string) => {
    if (!kbId) return;
    setWikiSpaceBusyId(wikiSpaceId);
    try {
      await removeKBWikiSpace(kbId, wikiSpaceId);
      toast.success(t('detail.toastWikiSpaceRemoved'));
      await loadKbWikiSpaces();
      await loadKb();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastWikiSpaceRemoveFailed'));
    } finally {
      setWikiSpaceBusyId(null);
    }
  };

  const handleIndexWikiSpace = async (wikiSpaceId: string) => {
    if (!kbId) return;
    if (!kb?.embedding_model_id) {
      toast.error(t('detail.indexJobRequiresEmbedding'));
      return;
    }
    setWikiSpaceBusyId(wikiSpaceId);
    try {
      const job = await enqueueKnowledgeBaseWikiSpaceIndexJob(kbId, wikiSpaceId);
      toast.success(t('detail.wikiSpaceIndexJobQueued', { id: job.id }));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.wikiSpaceIndexJobFailed'));
    } finally {
      setWikiSpaceBusyId(null);
    }
  };


  return {
    kbWikiSpaces,
    showWikiSpacePicker,
    wikiSpacePickerItems,
    wikiSpacePickerLoading,
    wikiSpaceBusyId,
    loadKbWikiSpaces,
    openWikiSpacePicker,
    closeWikiSpacePicker,
    handleAddWikiSpaceToKb,
    handleRemoveWikiSpaceFromKb,
    handleIndexWikiSpace,
  };
}
