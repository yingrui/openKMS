import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useEnsureDocumentChannels } from '../../contexts/DocumentChannelsContext';
import type { ChannelNode } from '../../data/channelsApi';
import { fetchDocuments } from '../../data/documentsApi';
import { fetchAllModels, type ApiModelResponse } from '../../data/modelsApi';
import {
  createWikiPage,
  deleteWikiPage,
  defaultVaultImportSkipOptions,
  fetchWikiPages,
  fetchWikiSpace,
  fetchWikiSpaceLinkedDocuments,
  importWikiVaultFolder,
  importWikiVaultZip,
  linkDocumentToWikiSpace,
  postWikiSpaceSemanticIndex,
  unlinkDocumentFromWikiSpace,
  updateWikiSpace,
  type VaultImportSkipOptions,
  type VaultImportProgress,
  vaultSkipExtensionSet,
  WIKI_PAGES_LIST_PAGE_SIZE,
  type WikiPageListItem,
  type WikiSpaceResponse,
  type WikiVaultImportResponse,
} from '../../data/wikiSpacesApi';

export type WikiLinkedDoc = { id: string; name: string; channel_id: string; updated_at: string };

function flattenChannelOptions(nodes: ChannelNode[], depth = 0): { id: string; label: string }[] {
  const rows: { id: string; label: string }[] = [];
  for (const n of nodes) {
    rows.push({ id: n.id, label: `${depth ? `${'— '.repeat(depth)}` : ''}${n.name}` });
    if (n.children?.length) rows.push(...flattenChannelOptions(n.children, depth + 1));
  }
  return rows;
}

/** Single-line label for selects; skips redundant "(model_name)" when it equals display name. */
function embeddingModelOneLineLabel(m: ApiModelResponse): string {
  const name = (m.name || '').trim();
  const modelName = (m.model_name || '').trim();
  if (modelName && modelName !== name) {
    return `${name} (${modelName})`;
  }
  return name || modelName || m.id;
}

export function useWikiSpaceSettings(spaceId: string | undefined) {
  const { t } = useTranslation('wikiSpace');
  const navigate = useNavigate();
  const [space, setSpace] = useState<WikiSpaceResponse | null>(null);
  const [pages, setPages] = useState<WikiPageListItem[]>([]);
  const [pagesTotal, setPagesTotal] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [listNonce, setListNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showNewPage, setShowNewPage] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [saving, setSaving] = useState(false);
  const [vaultImporting, setVaultImporting] = useState(false);
  const [vaultProgress, setVaultProgress] = useState<VaultImportProgress | null>(null);
  /** Modal: skip options + folder picker; import runs as soon as the browser exposes files (after its upload confirmation). */
  const [vaultFolderModalOpen, setVaultFolderModalOpen] = useState(false);
  const [vaultSkipOpts, setVaultSkipOpts] = useState<VaultImportSkipOptions>(() => defaultVaultImportSkipOptions());

  const { channels } = useEnsureDocumentChannels();
  const channelOptions = useMemo(() => flattenChannelOptions(channels), [channels]);

  const [linkedDocs, setLinkedDocs] = useState<WikiLinkedDoc[]>([]);
  const [spaceDraftName, setSpaceDraftName] = useState('');
  const [spaceDraftDesc, setSpaceDraftDesc] = useState('');
  const [spaceMetaSaving, setSpaceMetaSaving] = useState(false);
  const [semanticIndexing, setSemanticIndexing] = useState(false);
  const [semanticSettingsSaving, setSemanticSettingsSaving] = useState(false);
  const [embeddingModels, setEmbeddingModels] = useState<ApiModelResponse[]>([]);
  const [embeddingModelsLoading, setEmbeddingModelsLoading] = useState(true);
  const [semanticThresholdDraft, setSemanticThresholdDraft] = useState(0.4);
  const [semanticTopKDraft, setSemanticTopKDraft] = useState(10);
  /** Empty string = use global default embedding model (null on server). */
  const [semanticEmbeddingDraft, setSemanticEmbeddingDraft] = useState('');
  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const [docSearch, setDocSearch] = useState('');
  const [docChannelFilter, setDocChannelFilter] = useState('');
  const [docPickerLoading, setDocPickerLoading] = useState(false);
  const [docPickerItems, setDocPickerItems] = useState<Array<{ id: string; name: string; channel_id: string }>>([]);

  useEffect(() => {
    if (!docPickerOpen || !spaceId) return;
    let cancelled = false;
    const pickTimer = window.setTimeout(() => {
      void (async () => {
        setDocPickerLoading(true);
        try {
          const r = await fetchDocuments({
            channel_id: docChannelFilter || undefined,
            search: docSearch.trim() || undefined,
            limit: 60,
            offset: 0,
          });
          if (cancelled) return;
          setDocPickerItems(
            r.items.map((d) => ({ id: d.id, name: d.name, channel_id: d.channel_id }))
          );
        } catch (e) {
          if (!cancelled) {
            toast.error(e instanceof Error ? e.message : t('toastDocPickerLoadFailed'));
            setDocPickerItems([]);
          }
        } finally {
          if (!cancelled) setDocPickerLoading(false);
        }
      })();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(pickTimer);
    };
  }, [docPickerOpen, spaceId, docSearch, docChannelFilter, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setEmbeddingModelsLoading(true);
      try {
        const r = await fetchAllModels({ api_kind: 'embeddings' });
        if (!cancelled) setEmbeddingModels(r);
      } catch {
        if (!cancelled) setEmbeddingModels([]);
      } finally {
        if (!cancelled) setEmbeddingModelsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!spaceId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const offset = pageIndex * WIKI_PAGES_LIST_PAGE_SIZE;
        const [sp, pg, linked] = await Promise.all([
          fetchWikiSpace(spaceId),
          fetchWikiPages(spaceId, undefined, {
            limit: WIKI_PAGES_LIST_PAGE_SIZE,
            offset,
          }),
          fetchWikiSpaceLinkedDocuments(spaceId).catch(() => ({ items: [], total: 0 })),
        ]);
        if (cancelled) return;
        setSpace(sp);
        setSpaceDraftName(sp.name);
        setSpaceDraftDesc(sp.description ?? '');
        setSemanticThresholdDraft(
          typeof sp.semantic_similarity_threshold === 'number' ? sp.semantic_similarity_threshold : 0.4
        );
        setSemanticTopKDraft(
          typeof sp.semantic_match_top_k === 'number' && sp.semantic_match_top_k >= 1 ? sp.semantic_match_top_k : 10
        );
        setSemanticEmbeddingDraft(sp.semantic_embedding_model_id?.trim() ?? '');
        setLinkedDocs(
          linked.items.map((x) => ({
            id: x.document_id,
            name: x.name,
            channel_id: x.channel_id,
            updated_at: x.updated_at,
          }))
        );
        const total = pg.total;
        setPagesTotal(total);
        const maxPage = Math.max(0, Math.ceil(total / WIKI_PAGES_LIST_PAGE_SIZE) - 1);
        if (total > 0 && pageIndex > maxPage) {
          setPageIndex(maxPage);
          return;
        }
        setPages(pg.items);
      } catch (e: unknown) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : t('toastSpaceLoadFailed'));
          setSpace(null);
          setSpaceDraftName('');
          setSpaceDraftDesc('');
          setPages([]);
          setPagesTotal(0);
          setLinkedDocs([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spaceId, pageIndex, listNonce, t]);

  const hasEmbeddingCatalog = useMemo(
    () => embeddingModels.some((m) => (m.base_url || '').trim().length > 0),
    [embeddingModels]
  );

  const defaultEmbeddingLabel = useMemo(() => {
    const d = embeddingModels.find((m) => m.is_default_in_category);
    const pick = d ?? embeddingModels[0];
    return pick ? embeddingModelOneLineLabel(pick) : '—';
  }, [embeddingModels]);

  const semanticSettingsDirty = useMemo(() => {
    if (!space) return false;
    const th = Math.abs(semanticThresholdDraft - space.semantic_similarity_threshold) > 1e-9;
    const tk = semanticTopKDraft !== space.semantic_match_top_k;
    const sid = (semanticEmbeddingDraft || '') !== (space.semantic_embedding_model_id ?? '');
    return th || tk || sid;
  }, [space, semanticThresholdDraft, semanticTopKDraft, semanticEmbeddingDraft]);

  const spaceMetaDirty = useMemo(() => {
    if (!space) return false;
    const descNorm = (v: string) => v.trim();
    return (
      spaceDraftName.trim() !== space.name.trim() ||
      descNorm(spaceDraftDesc) !== descNorm(space.description ?? '')
    );
  }, [space, spaceDraftName, spaceDraftDesc]);

  const handleSaveSpaceMeta = async () => {
    if (!spaceId || !space) return;
    const name = spaceDraftName.trim();
    if (!name) {
      toast.error(t('toastSpaceNameRequired'));
      return;
    }
    setSpaceMetaSaving(true);
    try {
      const updated = await updateWikiSpace(spaceId, {
        name,
        description: spaceDraftDesc.trim() || null,
      });
      setSpace(updated);
      setSpaceDraftName(updated.name);
      setSpaceDraftDesc(updated.description ?? '');
      toast.success(t('toastSpaceMetaSaved'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('toastSpaceMetaFailed'));
    } finally {
      setSpaceMetaSaving(false);
    }
  };

  const handleSemanticIndex = async () => {
    if (!spaceId || !hasEmbeddingCatalog) return;
    setSemanticIndexing(true);
    try {
      const r = await postWikiSpaceSemanticIndex(spaceId);
      toast.success(t('toastSemanticIndexOk', { indexed: r.indexed, model: r.embedding_model_label }));
      if (r.failed > 0) {
        toast.warning(t('toastSemanticIndexPartial', { failed: r.failed }));
      }
      const sp = await fetchWikiSpace(spaceId);
      setSpace(sp);
      setSemanticThresholdDraft(
        typeof sp.semantic_similarity_threshold === 'number' ? sp.semantic_similarity_threshold : 0.4
      );
      setSemanticTopKDraft(
        typeof sp.semantic_match_top_k === 'number' && sp.semantic_match_top_k >= 1 ? sp.semantic_match_top_k : 10
      );
      setSemanticEmbeddingDraft(sp.semantic_embedding_model_id?.trim() ?? '');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('toastSemanticIndexFailed'));
    } finally {
      setSemanticIndexing(false);
    }
  };

  const handleSaveSemanticSettings = async () => {
    if (!spaceId || !space || !hasEmbeddingCatalog) return;
    const v = Math.max(0, Math.min(1, Number(semanticThresholdDraft)));
    if (!Number.isFinite(v)) {
      toast.error(t('toastSemanticSettingsFailed'));
      return;
    }
    const topK = Math.floor(Number(semanticTopKDraft));
    if (!Number.isFinite(topK) || topK < 1) {
      toast.error(t('toastSemanticTopKInvalid'));
      return;
    }
    setSemanticSettingsSaving(true);
    try {
      const updated = await updateWikiSpace(spaceId, {
        semantic_similarity_threshold: v,
        semantic_match_top_k: topK,
        semantic_embedding_model_id: semanticEmbeddingDraft.trim() || null,
      });
      setSpace(updated);
      setSemanticThresholdDraft(
        typeof updated.semantic_similarity_threshold === 'number'
          ? updated.semantic_similarity_threshold
          : 0.4
      );
      setSemanticTopKDraft(
        typeof updated.semantic_match_top_k === 'number' && updated.semantic_match_top_k >= 1
          ? updated.semantic_match_top_k
          : 10
      );
      setSemanticEmbeddingDraft(updated.semantic_embedding_model_id?.trim() ?? '');
      toast.success(t('toastSemanticSettingsSaved'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('toastSemanticSettingsFailed'));
    } finally {
      setSemanticSettingsSaving(false);
    }
  };

  const handleCreatePage = async () => {
    const path = newPath.trim();
    if (!spaceId || !path) return;
    const segments = path.split('/').filter(Boolean);
    const titleFromPath = segments.length ? segments[segments.length - 1]! : path;
    setSaving(true);
    try {
      const p = await createWikiPage(spaceId, {
        path,
        title: titleFromPath,
        body: '',
      });
      setShowNewPage(false);
      setNewPath('');
      toast.success(t('toastPageCreated'));
      navigate(`/wikis/${spaceId}/pages/${p.id}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('toastCreateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const summarizeVaultImport = (r: WikiVaultImportResponse) => {
    const parts = [`${r.pages_upserted} page(s)`, `${r.files_uploaded} file(s)`];
    if (r.skipped.length) parts.push(`${r.skipped.length} skipped`);
    return parts.join(', ');
  };

  const openVaultFolderModal = () => {
    setVaultSkipOpts(defaultVaultImportSkipOptions());
    setVaultFolderModalOpen(true);
  };

  const cancelVaultFolderModal = () => {
    setVaultFolderModalOpen(false);
  };

  const handleVaultFolderChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (!spaceId) return;
    if (!vaultFolderModalOpen) return;
    if (files.length === 0) {
      toast.error(t('toastNoFilesSelected'));
      return;
    }
    const skipSet = vaultSkipExtensionSet(vaultSkipOpts);
    setVaultFolderModalOpen(false);
    setVaultImporting(true);
    setVaultProgress(null);
    try {
      const r = await importWikiVaultFolder(spaceId, files, (p) => setVaultProgress(p), skipSet);
      toast.success(`${t('toastVaultImportPrefix')} ${summarizeVaultImport(r)}`);
      if (r.warnings.length) {
        toast.warning(
          `${r.warnings.length} warning(s): ${r.warnings.slice(0, 3).join(' · ')}${r.warnings.length > 3 ? '…' : ''}`
        );
      }
      setPageIndex(0);
      setListNonce((n) => n + 1);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('toastVaultImportFailed'));
    } finally {
      setVaultImporting(false);
      setVaultProgress(null);
    }
  };

  const handleVaultZipChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const zipFile = e.target.files?.[0];
    e.target.value = '';
    if (!spaceId || !zipFile) return;
    setVaultImporting(true);
    try {
      const r = await importWikiVaultZip(spaceId, zipFile);
      toast.success(`${t('toastVaultImportPrefix')} ${summarizeVaultImport(r)}`);
      if (r.warnings.length) {
        toast.warning(
          `${r.warnings.length} warning(s): ${r.warnings.slice(0, 3).join(' · ')}${r.warnings.length > 3 ? '…' : ''}`
        );
      }
      setPageIndex(0);
      setListNonce((n) => n + 1);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('toastVaultImportFailed'));
    } finally {
      setVaultImporting(false);
    }
  };

  const handleDeletePage = async (p: WikiPageListItem) => {
    if (!spaceId || !confirm(t('confirmDeletePage', { path: p.path }))) return;
    try {
      await deleteWikiPage(spaceId, p.id);
      toast.success(t('toastPageDeleted'));
      setListNonce((n) => n + 1);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('toastDeleteFailed'));
    }
  };

  const handleRemoveLinkedDoc = (docId: string) => {
    if (!spaceId) return;
    void (async () => {
      try {
        await unlinkDocumentFromWikiSpace(spaceId, docId);
        setLinkedDocs((prev) => prev.filter((x) => x.id !== docId));
        toast.success(t('toastLinkRemoved'));
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t('toastRemoveLinkFailed'));
      }
    })();
  };

  const handleLinkDoc = (docId: string) => {
    if (!spaceId || linkedDocs.some((l) => l.id === docId)) return;
    void (async () => {
      try {
        const row = await linkDocumentToWikiSpace(spaceId, docId);
        setLinkedDocs((prev) => [
          ...prev,
          {
            id: row.document_id,
            name: row.name,
            channel_id: row.channel_id,
            updated_at: row.updated_at,
          },
        ]);
        toast.success(t('toastDocumentLinked'));
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t('toastLinkFailed'));
      }
    })();
  };

  const openDocPicker = () => {
    setDocSearch('');
    setDocChannelFilter('');
    setDocPickerOpen(true);
  };

  const progressDisplay: VaultImportProgress = vaultProgress ?? {
    phase: 'binary',
    currentIndex: 0,
    total: 1,
    path: t('preparing'),
  };

  const importOverallPercent =
    progressDisplay.total > 0
      ? Math.min(
          100,
          Math.round(
            ((Math.max(0, progressDisplay.currentIndex - 1) +
              (progressDisplay.phase === 'binary' &&
              progressDisplay.fileTotal &&
              progressDisplay.fileTotal > 0
                ? Math.min(1, (progressDisplay.fileLoaded ?? 0) / progressDisplay.fileTotal)
                : 0)) /
              progressDisplay.total) *
              100
          )
        )
      : 0;

  const pageCount = Math.max(1, Math.ceil(pagesTotal / WIKI_PAGES_LIST_PAGE_SIZE));

  return {
    t,
    space,
    pages,
    pagesTotal,
    pageIndex,
    setPageIndex,
    loading,
    showNewPage,
    setShowNewPage,
    newPath,
    setNewPath,
    saving,
    vaultImporting,
    vaultFolderModalOpen,
    vaultSkipOpts,
    setVaultSkipOpts,
    channelOptions,
    linkedDocs,
    spaceDraftName,
    setSpaceDraftName,
    spaceDraftDesc,
    setSpaceDraftDesc,
    spaceMetaSaving,
    semanticIndexing,
    semanticSettingsSaving,
    embeddingModels,
    embeddingModelsLoading,
    semanticThresholdDraft,
    setSemanticThresholdDraft,
    semanticTopKDraft,
    setSemanticTopKDraft,
    semanticEmbeddingDraft,
    setSemanticEmbeddingDraft,
    docPickerOpen,
    setDocPickerOpen,
    docSearch,
    setDocSearch,
    docChannelFilter,
    setDocChannelFilter,
    docPickerLoading,
    docPickerItems,
    hasEmbeddingCatalog,
    defaultEmbeddingLabel,
    semanticSettingsDirty,
    spaceMetaDirty,
    handleSaveSpaceMeta,
    handleSemanticIndex,
    handleSaveSemanticSettings,
    handleCreatePage,
    openVaultFolderModal,
    cancelVaultFolderModal,
    handleVaultFolderChange,
    handleVaultZipChange,
    handleDeletePage,
    handleRemoveLinkedDoc,
    handleLinkDoc,
    openDocPicker,
    progressDisplay,
    importOverallPercent,
    pageCount,
    embeddingModelOneLineLabel,
  };
}
