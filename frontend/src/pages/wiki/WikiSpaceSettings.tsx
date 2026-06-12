import { useEffect, useMemo, useState, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileStack, FileText, FolderUp, Network, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useEnsureDocumentChannels } from '../../contexts/DocumentChannelsContext';
import type { ChannelNode } from '../../data/channelsApi';
import { fetchDocuments } from '../../data/documentsApi';
import { fetchAllModels, type ApiModelResponse } from '../../data/modelsApi';
import { ResourceSharePanel } from '../../components/ResourceSharePanel';
import { RESOURCE_TYPES } from '../../data/resourceAclApi';
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
import './WikiSpaceSettings.scss';

export type WikiLinkedDoc = { id: string; name: string; channel_id: string; updated_at: string };

function flattenChannelOptions(nodes: ChannelNode[], depth = 0): { id: string; label: string }[] {
  const rows: { id: string; label: string }[] = [];
  for (const n of nodes) {
    rows.push({ id: n.id, label: `${depth ? `${'— '.repeat(depth)}` : ''}${n.name}` });
    if (n.children?.length) rows.push(...flattenChannelOptions(n.children, depth + 1));
  }
  return rows;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRowUpdatedAt(iso: string, dash: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return dash;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
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

export function WikiSpaceSettings() {
  const { t } = useTranslation('wikiSpace');
  const navigate = useNavigate();
  const { id: spaceId } = useParams<{ id: string }>();
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

  if (!spaceId) {
    return <p className="wiki-space-settings-muted">{t('missingSpaceId')}</p>;
  }

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

  return (
    <div className="wiki-space-settings">
      <div className="wiki-space-settings-body">
        <div className="wiki-space-settings-toolbar-span">
          <Link to="/wikis" className="wiki-space-settings-back">
            <ArrowLeft size={18} />
            {t('back')}
          </Link>
        </div>
        {loading && (
          <p className="wiki-space-settings-body-loading wiki-space-settings-muted">{t('loading')}</p>
        )}
        {!loading && !space && (
          <p className="wiki-space-settings-body-loading wiki-space-settings-muted" role="alert">
            {t('loadFailed')}
          </p>
        )}
        {!loading && space && (
          <div className="wiki-space-settings-content-row">
          <div className="wiki-space-settings-main">
            <header className="wiki-space-settings-hero">
              <p className="wiki-space-settings-eyebrow">{t('settingsEyebrow')}</p>
              <h1 className="wiki-space-settings-page-title">{t('settingsPageTitle')}</h1>
              <p className="wiki-space-settings-page-subtitle">{t('settingsPageSubtitle')}</p>
            </header>

            <div className="wiki-space-settings-cta">
              <Link to={`/wikis/${spaceId}/pages/graph`} className="btn btn-primary wiki-space-settings-open-workspace">
                <Network size={18} aria-hidden />
                {t('openWorkspace')}
              </Link>
            </div>

            <section className="wiki-space-settings-section wiki-space-settings-card" aria-labelledby="wiki-settings-space-heading">
              <div className="wiki-space-settings-card-head">
                <h2 id="wiki-settings-space-heading" className="wiki-space-settings-section-title">
                  {t('sectionSpace')}
                </h2>
              </div>
              <div className="wiki-space-settings-space-form">
                <label className="wiki-space-settings-field">
                  <span>{t('spaceNameLabel')}</span>
                  <input
                    type="text"
                    value={spaceDraftName}
                    onChange={(e) => setSpaceDraftName(e.target.value)}
                    autoComplete="off"
                  />
                </label>
                <label className="wiki-space-settings-field">
                  <span>{t('spaceDescLabel')}</span>
                  <textarea
                    value={spaceDraftDesc}
                    onChange={(e) => setSpaceDraftDesc(e.target.value)}
                    rows={3}
                  />
                </label>
                <div className="wiki-space-settings-space-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={!spaceMetaDirty || spaceMetaSaving}
                    onClick={() => {
                      if (!space) return;
                      setSpaceDraftName(space.name);
                      setSpaceDraftDesc(space.description ?? '');
                    }}
                  >
                    {t('resetEdits')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!spaceMetaDirty || spaceMetaSaving || !spaceDraftName.trim()}
                    onClick={() => void handleSaveSpaceMeta()}
                  >
                    {spaceMetaSaving ? t('savingSpaceMeta') : t('saveSpaceMeta')}
                  </button>
                </div>
              </div>
            </section>

            <section className="wiki-space-settings-section wiki-space-settings-card" id="sharing">
              <ResourceSharePanel
                resourceType={RESOURCE_TYPES.wikiSpace}
                resourceId={spaceId}
                title={t('sectionSharing')}
              />
            </section>

            <section
              className="wiki-space-settings-section wiki-space-settings-card"
              aria-labelledby="wiki-settings-semantic-heading"
            >
              <div className="wiki-space-settings-card-head">
                <h2 id="wiki-settings-semantic-heading" className="wiki-space-settings-section-title wiki-space-settings-section-title--inline-icon">
                  <Sparkles size={20} strokeWidth={1.75} aria-hidden />
                  {t('sectionSemantic')}
                </h2>
              </div>
              <p className="wiki-space-settings-card-hint wiki-space-settings-muted">{t('sectionSemanticHint')}</p>
              {embeddingModelsLoading ? (
                <p className="wiki-space-settings-muted">{t('semanticModelsLoading')}</p>
              ) : !hasEmbeddingCatalog ? (
                <p className="wiki-space-settings-semantic-unavailable wiki-space-settings-muted">{t('semanticNoEmbedding')}</p>
              ) : (
                <div className="wiki-space-settings-semantic-form">
                  <div className="wiki-space-settings-semantic-row">
                    <span className="wiki-space-settings-semantic-label">{t('semanticEmbeddingModelLabel')}</span>
                    <div className="wiki-space-settings-semantic-control">
                      <select
                        className="wiki-space-settings-select"
                        value={semanticEmbeddingDraft}
                        onChange={(e) => setSemanticEmbeddingDraft(e.target.value)}
                        disabled={semanticSettingsSaving || vaultImporting || !spaceId || semanticIndexing}
                        aria-label={t('semanticEmbeddingModelLabel')}
                      >
                        <option value="">{t('semanticEmbeddingDefaultOption', { name: defaultEmbeddingLabel })}</option>
                        {embeddingModels
                          .filter((m) => (m.base_url || '').trim().length > 0)
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {embeddingModelOneLineLabel(m)}
                              {m.is_default_in_category ? ` — ${t('semanticEmbeddingBadgeDefault')}` : ''}
                            </option>
                          ))}
                      </select>
                      <p className="wiki-space-settings-field-hint wiki-space-settings-muted">{t('semanticEmbeddingHint')}</p>
                    </div>
                  </div>
                  <div className="wiki-space-settings-semantic-row">
                    <span className="wiki-space-settings-semantic-label">{t('semanticTopKLabel')}</span>
                    <div className="wiki-space-settings-semantic-control">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        className="wiki-space-settings-input-narrow"
                        value={semanticTopKDraft}
                        onChange={(e) => setSemanticTopKDraft(Number(e.target.value))}
                        disabled={semanticSettingsSaving || vaultImporting || !spaceId || semanticIndexing}
                        aria-label={t('semanticTopKLabel')}
                      />
                      <p className="wiki-space-settings-field-hint wiki-space-settings-muted">{t('semanticTopKHint')}</p>
                    </div>
                  </div>
                  <div className="wiki-space-settings-semantic-row">
                    <span className="wiki-space-settings-semantic-label">{t('semanticSimilarityLabel')}</span>
                    <div className="wiki-space-settings-semantic-control">
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        className="wiki-space-settings-input-narrow"
                        value={semanticThresholdDraft}
                        onChange={(e) => setSemanticThresholdDraft(Number(e.target.value))}
                        disabled={semanticSettingsSaving || vaultImporting || !spaceId || semanticIndexing}
                        aria-valuemin={0}
                        aria-valuemax={1}
                        aria-label={t('semanticSimilarityLabel')}
                      />
                      <p className="wiki-space-settings-field-hint wiki-space-settings-muted">{t('semanticSimilarityHint')}</p>
                    </div>
                  </div>
                  <div className="wiki-space-settings-semantic-row">
                    <span className="wiki-space-settings-semantic-label">{t('semanticLastIndexLabel')}</span>
                    <div className="wiki-space-settings-semantic-control">
                      <p className="wiki-space-settings-semantic-last-index">
                        {space?.last_semantic_index_at
                          ? formatRowUpdatedAt(space.last_semantic_index_at, t('dashDate'))
                          : t('semanticIndexNever')}
                      </p>
                    </div>
                  </div>
                  <div className="wiki-space-settings-semantic-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={
                        !semanticSettingsDirty ||
                        semanticSettingsSaving ||
                        vaultImporting ||
                        !spaceId ||
                        semanticIndexing
                      }
                      onClick={() => void handleSaveSemanticSettings()}
                    >
                      {semanticSettingsSaving ? t('savingSemanticSettings') : t('saveSemanticSettings')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={semanticSettingsSaving || vaultImporting || !spaceId || semanticIndexing}
                      onClick={() => void handleSemanticIndex()}
                    >
                      {semanticIndexing ? t('semanticIndexing') : t('semanticIndexBuild')}
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="wiki-space-settings-section wiki-space-settings-card" aria-labelledby="wiki-settings-imports-heading">
              <div className="wiki-space-settings-card-head">
                <h2 id="wiki-settings-imports-heading" className="wiki-space-settings-section-title">
                  {t('sectionImports')}
                </h2>
              </div>
              <p className="wiki-space-settings-card-hint wiki-space-settings-muted">{t('sectionImportsHint')}</p>
              <div className="wiki-space-settings-actions wiki-space-settings-import-actions">
                <button
                  type="button"
                  className="btn btn-secondary wiki-space-settings-import-folder-btn"
                  title={t('importFolderTitle')}
                  disabled={vaultImporting || vaultFolderModalOpen}
                  onClick={openVaultFolderModal}
                >
                  <FolderUp size={18} />
                  {t('importFolder')}
                </button>
                <label className="btn btn-secondary wiki-space-settings-import-label" title={t('importZipTitle')}>
                  <input
                    type="file"
                    className="wiki-space-settings-file-input-overlay"
                    accept=".zip,application/zip"
                    disabled={vaultImporting}
                    onChange={(ev) => void handleVaultZipChange(ev)}
                  />
                  <Upload size={18} />
                  {t('importZip')}
                </label>
                <button type="button" className="btn btn-primary" onClick={() => setShowNewPage(true)}>
                  <Plus size={18} />
                  {t('newPage')}
                </button>
              </div>
            </section>

            <section
              className={`wiki-space-settings-section wiki-space-settings-card${pagesTotal > 0 ? ' wiki-space-settings-section--tight' : ''}`}
              aria-labelledby="wiki-settings-pages-heading"
            >
              <div className="wiki-space-settings-card-head wiki-space-settings-card-head--split">
                <h2 id="wiki-settings-pages-heading" className="wiki-space-settings-section-title">
                  {t('sectionPages')}
                </h2>
                <Link to={`/wikis/${spaceId}/pages/graph`} className="btn btn-secondary btn-sm">
                  {t('browsePagesInWorkspace')}
                </Link>
              </div>
              <p className="wiki-space-settings-card-hint wiki-space-settings-muted">{t('sectionPagesHint')}</p>
              {pagesTotal === 0 ? (
                <p className="wiki-space-settings-muted">{t('noPagesYet')}</p>
              ) : (
                <>
                  <ul className="wiki-space-settings-pages">
                    {pages.map((p) => (
                      <li key={p.id} className="wiki-space-settings-page-row">
                        <Link to={`/wikis/${spaceId}/pages/${p.id}`} className="wiki-space-settings-page-link">
                          <FileText size={18} strokeWidth={1.5} className="wiki-space-settings-page-icon" aria-hidden />
                          <span className="wiki-space-settings-page-path">{p.path}</span>
                        </Link>
                        <time
                          className="wiki-space-settings-page-updated"
                          dateTime={p.updated_at}
                          title={p.updated_at}
                        >
                          {formatRowUpdatedAt(p.updated_at, t('dashDate'))}
                        </time>
                        <button
                          type="button"
                          className="wiki-space-settings-icon-btn"
                          aria-label={t('deletePageAria')}
                          onClick={() => void handleDeletePage(p)}
                        >
                          <Trash2 size={18} strokeWidth={1.5} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {pageCount > 1 && (
                    <nav className="wiki-space-settings-pagination" aria-label={t('paginationAria')}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={pageIndex <= 0}
                        onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                      >
                        {t('previous')}
                      </button>
                      <span className="wiki-space-settings-pagination-status">
                        {t('paginationStatus', {
                          current: pageIndex + 1,
                          total: pageCount,
                          count: pagesTotal,
                          size: WIKI_PAGES_LIST_PAGE_SIZE,
                        })}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={pageIndex >= pageCount - 1}
                        onClick={() => setPageIndex((i) => Math.min(pageCount - 1, i + 1))}
                      >
                        {t('next')}
                      </button>
                    </nav>
                  )}
                </>
              )}
            </section>

            <section className="wiki-space-settings-section wiki-space-settings-card" aria-labelledby="wiki-settings-docs-heading">
              <div className="wiki-space-settings-documents-head">
                <h2 id="wiki-settings-docs-heading" className="wiki-space-settings-section-title">
                  {t('linkedDocuments')}
                </h2>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setDocSearch('');
                    setDocChannelFilter('');
                    setDocPickerOpen(true);
                  }}
                >
                  {t('addDocuments')}
                </button>
              </div>
              <p className="wiki-space-settings-card-hint wiki-space-settings-muted">{t('sectionLinkedDocsHint')}</p>
              {linkedDocs.length === 0 ? (
                <p className="wiki-space-settings-muted">{t('noLinkedDocsHint')}</p>
              ) : (
                <ul className="wiki-space-settings-pages">
                  {linkedDocs.map((d) => (
                    <li key={d.id} className="wiki-space-settings-page-row">
                      <Link to={`/documents/view/${d.id}`} className="wiki-space-settings-page-link">
                        <FileStack size={18} strokeWidth={1.5} className="wiki-space-settings-page-icon" aria-hidden />
                        <span className="wiki-space-settings-page-path">{d.name}</span>
                      </Link>
                      <time
                        className="wiki-space-settings-page-updated"
                        dateTime={d.updated_at}
                        title={d.updated_at}
                      >
                        {formatRowUpdatedAt(d.updated_at, t('dashDate'))}
                      </time>
                      <button
                        type="button"
                        className="wiki-space-settings-icon-btn"
                        aria-label={t('removeLinkAria')}
                        onClick={() => {
                          if (!spaceId) return;
                          void (async () => {
                            try {
                              await unlinkDocumentFromWikiSpace(spaceId, d.id);
                              setLinkedDocs((prev) => prev.filter((x) => x.id !== d.id));
                              toast.success(t('toastLinkRemoved'));
                            } catch (e: unknown) {
                              toast.error(e instanceof Error ? e.message : t('toastRemoveLinkFailed'));
                            }
                          })();
                        }}
                      >
                        <Trash2 size={18} strokeWidth={1.5} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          </div>
        )}
      </div>

      {docPickerOpen && spaceId && (
        <div
          className="wiki-space-settings-modal-overlay"
          role="presentation"
          onClick={() => setDocPickerOpen(false)}
        >
          <div
            className="wiki-space-settings-modal wiki-space-settings-doc-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wiki-doc-picker-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h3 id="wiki-doc-picker-title">{t('docPickerTitle')}</h3>
            <p className="wiki-space-settings-muted wiki-space-settings-doc-picker-hint">{t('docPickerHint')}</p>
            <div className="wiki-space-settings-doc-picker-filters">
              <label className="wiki-space-settings-doc-picker-label">
                {t('channel')}
                <select
                  className="wiki-space-settings-doc-picker-select"
                  value={docChannelFilter}
                  onChange={(e) => setDocChannelFilter(e.target.value)}
                >
                  <option value="">{t('channelFilterAll')}</option>
                  {channelOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wiki-space-settings-doc-picker-label wiki-space-settings-doc-picker-label--grow">
                {t('searchByName')}
                <input
                  type="search"
                  className="wiki-space-settings-doc-picker-input"
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  placeholder={t('filterPlaceholder')}
                />
              </label>
            </div>
            <div className="wiki-space-settings-doc-picker-list" role="listbox" aria-label={t('docResultsAria')}>
              {docPickerLoading ? (
                <p className="wiki-space-settings-muted">{t('docPickerLoading')}</p>
              ) : docPickerItems.length === 0 ? (
                <p className="wiki-space-settings-muted">{t('noDocumentsMatch')}</p>
              ) : (
                <ul className="wiki-space-settings-doc-picker-ul">
                  {docPickerItems.map((d) => {
                    const already = linkedDocs.some((l) => l.id === d.id);
                    return (
                      <li key={d.id} className="wiki-space-settings-doc-picker-row">
                        <span className="wiki-space-settings-doc-picker-name" title={d.name}>
                          {d.name}
                        </span>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={already}
                          onClick={() => {
                            if (already || !spaceId) return;
                            void (async () => {
                              try {
                                const row = await linkDocumentToWikiSpace(spaceId, d.id);
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
                          }}
                        >
                          {already ? t('alreadyLinked') : t('linkAction')}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="wiki-space-settings-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDocPickerOpen(false)}>
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {vaultFolderModalOpen && (
        <div
          className="wiki-space-settings-modal-overlay wiki-space-settings-vault-options-overlay"
          role="presentation"
          onClick={() => cancelVaultFolderModal()}
        >
          <div
            className="wiki-space-settings-modal wiki-space-settings-vault-options"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vault-import-options-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h3 id="vault-import-options-title">{t('vaultModalTitle')}</h3>
            <p className="wiki-space-settings-vault-options-hint">{t('vaultModalHint')}</p>
            <ul className="wiki-space-settings-vault-options-list">
              <li>
                <label className="wiki-space-settings-vault-options-row">
                  <input
                    type="checkbox"
                    checked={vaultSkipOpts.skipPdf}
                    onChange={(ev) => setVaultSkipOpts((o) => ({ ...o, skipPdf: ev.target.checked }))}
                  />
                  <span>{t('skipPdf')}</span>
                </label>
              </li>
              <li>
                <label className="wiki-space-settings-vault-options-row">
                  <input
                    type="checkbox"
                    checked={vaultSkipOpts.skipDocx}
                    onChange={(ev) => setVaultSkipOpts((o) => ({ ...o, skipDocx: ev.target.checked }))}
                  />
                  <span>{t('skipDocx')}</span>
                </label>
              </li>
              <li>
                <label className="wiki-space-settings-vault-options-row">
                  <input
                    type="checkbox"
                    checked={vaultSkipOpts.skipDoc}
                    onChange={(ev) => setVaultSkipOpts((o) => ({ ...o, skipDoc: ev.target.checked }))}
                  />
                  <span>{t('skipDoc')}</span>
                </label>
              </li>
              <li>
                <label className="wiki-space-settings-vault-options-row">
                  <input
                    type="checkbox"
                    checked={vaultSkipOpts.skipPptx}
                    onChange={(ev) => setVaultSkipOpts((o) => ({ ...o, skipPptx: ev.target.checked }))}
                  />
                  <span>{t('skipPptx')}</span>
                </label>
              </li>
              <li>
                <label className="wiki-space-settings-vault-options-row">
                  <input
                    type="checkbox"
                    checked={vaultSkipOpts.skipPpt}
                    onChange={(ev) => setVaultSkipOpts((o) => ({ ...o, skipPpt: ev.target.checked }))}
                  />
                  <span>{t('skipPpt')}</span>
                </label>
              </li>
            </ul>
            <div className="wiki-space-settings-modal-actions wiki-space-settings-vault-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={cancelVaultFolderModal}>
                {t('cancel')}
              </button>
              <label className="btn btn-primary wiki-space-settings-import-label wiki-space-settings-modal-folder-label">
                <input
                  type="file"
                  className="wiki-space-settings-file-input-overlay"
                  {...({ webkitdirectory: '', directory: '' } as InputHTMLAttributes<HTMLInputElement>)}
                  multiple
                  disabled={vaultImporting}
                  onChange={(ev) => void handleVaultFolderChange(ev)}
                />
                {t('chooseVaultFolder')}
              </label>
            </div>
          </div>
        </div>
      )}

      {vaultImporting && (
        <div className="wiki-space-settings-import-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="wiki-space-settings-import-dialog">
            <h3 className="wiki-space-settings-import-title">{t('importingTitle')}</h3>
            <p className="wiki-space-settings-import-phase">
              {progressDisplay.phase === 'binary' ? t('phaseUploadBinary') : t('phaseImportMd')}
            </p>
            <p className="wiki-space-settings-import-path" title={progressDisplay.path}>
              {progressDisplay.path}
            </p>
            <div className="wiki-space-settings-import-bar wiki-space-settings-import-bar--overall">
              <div
                className="wiki-space-settings-import-bar-fill"
                style={{ width: `${importOverallPercent}%` }}
              />
            </div>
            <p className="wiki-space-settings-import-count">
              {progressDisplay.currentIndex > 0
                ? t('fileProgress', {
                    current: progressDisplay.currentIndex,
                    total: progressDisplay.total,
                  })
                : t('starting')}
            </p>
            {progressDisplay.phase === 'binary' &&
              progressDisplay.fileTotal != null &&
              progressDisplay.fileTotal > 0 && (
                <>
                  <p className="wiki-space-settings-import-bytes">
                    {formatBytes(progressDisplay.fileLoaded ?? 0)} / {formatBytes(progressDisplay.fileTotal)}
                  </p>
                  <div className="wiki-space-settings-import-bar">
                    <div
                      className="wiki-space-settings-import-bar-fill"
                      style={{
                        width: `${Math.min(100, Math.round(((progressDisplay.fileLoaded ?? 0) / progressDisplay.fileTotal) * 100))}%`,
                      }}
                    />
                  </div>
                </>
              )}
          </div>
        </div>
      )}

      {showNewPage && (
        <div className="wiki-space-settings-modal-overlay" role="presentation" onClick={() => setShowNewPage(false)}>
          <div
            className="wiki-space-settings-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{t('newPageModalTitle')}</h3>
            <label>
              {t('pathRequired')} <span className="wiki-space-settings-req">*</span>
              <input
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder={t('pathPlaceholder')}
              />
            </label>
            <div className="wiki-space-settings-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowNewPage(false)}>
                {t('cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving || !newPath.trim()}
                onClick={() => void handleCreatePage()}
              >
                {t('create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
