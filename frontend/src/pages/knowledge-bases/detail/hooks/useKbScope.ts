import { useCallback, useState } from 'react';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import {
  addKBOntologyGroup,
  addKBSemanticModel,
  addKBWikiSpace,
  enqueueKnowledgeBaseWikiSpaceIndexJob,
  fetchKBOntologyGroups,
  fetchKBSemanticModels,
  fetchKBWikiSpaces,
  removeKBOntologyGroup,
  removeKBSemanticModel,
  removeKBWikiSpace,
  type KBOntologyGroupResponse,
  type KBSemanticModelResponse,
  type KBWikiSpaceResponse,
  type KnowledgeBaseResponse,
} from '../../../../data/knowledgeBasesApi';
import { fetchSemanticModels } from '../../../../data/semanticModelsApi';
import { fetchOntologyGroups } from '../../../../data/ontologyGroupsApi';
import { fetchAllWikiSpaces, type WikiSpaceResponse } from '../../../../data/wikiSpacesApi';

/**
 * What the agent may consult, and what it indexes: linked wiki spaces, Catalog models and ontology groups.
 *
 * Linking is a write to the knowledge base and a per-space re-index job; both end in `loadKb`, because the
 * header counts move. The three link kinds are the same shape, which is why they read as one group here.
 */
export function useKbScope({
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
  const [kbSemanticModels, setKbSemanticModels] = useState<KBSemanticModelResponse[]>([]);
  const [kbOntologyGroups, setKbOntologyGroups] = useState<KBOntologyGroupResponse[]>([]);
  const [allSemanticModels, setAllSemanticModels] = useState<{ id: string; name: string }[]>([]);
  const [allOntologyGroups, setAllOntologyGroups] = useState<{ id: string; display_name: string }[]>([]);
  const [scopeBusyId, setScopeBusyId] = useState<string | null>(null);
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

  const loadKbAgentScope = useCallback(async () => {
    if (!kbId) return;
    try {
      const [linkedModels, linkedGroups, models, groups] = await Promise.all([
        fetchKBSemanticModels(kbId),
        fetchKBOntologyGroups(kbId),
        fetchSemanticModels(),
        fetchOntologyGroups(),
      ]);
      setKbSemanticModels(linkedModels);
      setKbOntologyGroups(linkedGroups);
      setAllSemanticModels(models.items.map((m) => ({ id: m.id, name: m.name })));
      setAllOntologyGroups(groups.map((g) => ({ id: g.id, display_name: g.display_name })));
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

  const handleAddSemanticModelToKb = async (semanticModelId: string) => {
    if (!kbId || !semanticModelId) return;
    setScopeBusyId(semanticModelId);
    try {
      await addKBSemanticModel(kbId, semanticModelId);
      toast.success(t('detail.toastSemanticModelLinked'));
      await loadKbAgentScope();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastSemanticModelLinkFailed'));
    } finally {
      setScopeBusyId(null);
    }
  };

  const handleRemoveSemanticModelFromKb = async (semanticModelId: string) => {
    if (!kbId) return;
    setScopeBusyId(semanticModelId);
    try {
      await removeKBSemanticModel(kbId, semanticModelId);
      toast.success(t('detail.toastSemanticModelRemoved'));
      await loadKbAgentScope();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastSemanticModelRemoveFailed'));
    } finally {
      setScopeBusyId(null);
    }
  };

  const handleAddOntologyGroupToKb = async (ontologyGroupId: string) => {
    if (!kbId || !ontologyGroupId) return;
    setScopeBusyId(ontologyGroupId);
    try {
      await addKBOntologyGroup(kbId, ontologyGroupId);
      toast.success(t('detail.toastOntologyGroupLinked'));
      await loadKbAgentScope();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastOntologyGroupLinkFailed'));
    } finally {
      setScopeBusyId(null);
    }
  };

  const handleRemoveOntologyGroupFromKb = async (ontologyGroupId: string) => {
    if (!kbId) return;
    setScopeBusyId(ontologyGroupId);
    try {
      await removeKBOntologyGroup(kbId, ontologyGroupId);
      toast.success(t('detail.toastOntologyGroupRemoved'));
      await loadKbAgentScope();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('detail.toastOntologyGroupRemoveFailed'));
    } finally {
      setScopeBusyId(null);
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
    kbSemanticModels,
    kbOntologyGroups,
    allSemanticModels,
    allOntologyGroups,
    scopeBusyId,
    showWikiSpacePicker,
    wikiSpacePickerItems,
    wikiSpacePickerLoading,
    wikiSpaceBusyId,
    loadKbWikiSpaces,
    loadKbAgentScope,
    openWikiSpacePicker,
    closeWikiSpacePicker,
    handleAddWikiSpaceToKb,
    handleRemoveWikiSpaceFromKb,
    handleAddSemanticModelToKb,
    handleRemoveSemanticModelFromKb,
    handleAddOntologyGroupToKb,
    handleRemoveOntologyGroupFromKb,
    handleIndexWikiSpace,
  };
}
