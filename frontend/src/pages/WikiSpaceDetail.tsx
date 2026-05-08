import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Bot, ChevronsLeft, FileStack, FileText, FolderUp, Network, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { WikiSpaceAgentPanel } from '../components/wiki/WikiSpaceAgentPanel';
import { useDocumentChannels } from '../contexts/DocumentChannelsContext';
import type { ChannelNode } from '../data/channelsApi';
import { fetchDocuments } from '../data/documentsApi';
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
  unlinkDocumentFromWikiSpace,
  type VaultImportSkipOptions,
  type VaultImportProgress,
  vaultSkipExtensionSet,
  WIKI_PAGES_LIST_PAGE_SIZE,
  type WikiPageResponse,
  type WikiSpaceResponse,
  type WikiVaultImportResponse,
} from '../data/wikiSpacesApi';
import './WikiSpaceDetail.css';

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

export function WikiSpaceDetail() {
  const { t } = useTranslation('wikiSpace');
  const { id: spaceId } = useParams<{ id: string }>();
  const [space, setSpace] = useState<WikiSpaceResponse | null>(null);
  const [pages, setPages] = useState<WikiPageResponse[]>([]);
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

  const { channels } = useDocumentChannels();
  const channelOptions = useMemo(() => flattenChannelOptions(channels), [channels]);

  const [mainTab, setMainTab] = useState<'pages' | 'documents'>('pages');
  const [linkedDocs, setLinkedDocs] = useState<WikiLinkedDoc[]>([]);
  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const [docSearch, setDocSearch] = useState('');
  const [docChannelFilter, setDocChannelFilter] = useState('');
  const [docPickerLoading, setDocPickerLoading] = useState(false);
  const [docPickerItems, setDocPickerItems] = useState<Array<{ id: string; name: string; channel_id: string }>>([]);

  const wikiRailStorageKey = spaceId ? `openkms_wiki_rail_collapsed_v1_${spaceId}` : null;
  const [wikiAssistantCollapsed, setWikiAssistantCollapsed] = useState(false);

  useEffect(() => {
    if (!wikiRailStorageKey) {
      setWikiAssistantCollapsed(false);
      return;
    }
    try {
      setWikiAssistantCollapsed(sessionStorage.getItem(wikiRailStorageKey) === '1');
    } catch {
      setWikiAssistantCollapsed(false);
    }
  }, [wikiRailStorageKey]);

  const collapseWikiAssistant = useCallback(() => {
    if (!wikiRailStorageKey) return;
    setWikiAssistantCollapsed(true);
    try {
      sessionStorage.setItem(wikiRailStorageKey, '1');
    } catch {
      /* ignore */
    }
  }, [wikiRailStorageKey]);

  const expandWikiAssistant = useCallback(() => {
    if (!wikiRailStorageKey) return;
    setWikiAssistantCollapsed(false);
    try {
      sessionStorage.removeItem(wikiRailStorageKey);
    } catch {
      /* ignore */
    }
  }, [wikiRailStorageKey]);

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
      window.location.href = `/wikis/${spaceId}/pages/${p.id}`;
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

  const handleDeletePage = async (p: WikiPageResponse) => {
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
    return <p className="wiki-space-detail-muted">{t('missingSpaceId')}</p>;
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
    <div
      className={`wiki-space-detail${
        !loading && space
          ? ` wiki-space-detail--split${wikiAssistantCollapsed ? ' wiki-space-detail--agent-collapsed' : ''}`
          : ''
      }`}
    >
      <div className="wiki-space-detail-body">
        <div className="wiki-space-detail-toolbar-span">
          <Link to="/wikis" className="wiki-space-detail-back">
            <ArrowLeft size={18} />
            {t('back')}
          </Link>
        </div>
        {loading && (
          <p className="wiki-space-detail-body-loading wiki-space-detail-muted">{t('loading')}</p>
        )}
        {!loading && !space && (
          <p className="wiki-space-detail-body-loading wiki-space-detail-muted" role="alert">
            {t('loadFailed')}
          </p>
        )}
        {!loading && space && (
          <div className="wiki-space-detail-content-row">
          <div className="wiki-space-detail-main">
            <header className="wiki-space-detail-header">
              <div>
                <h1>{space.name}</h1>
                {space.description && <p className="wiki-space-detail-desc">{space.description}</p>}
              </div>
              <div className="wiki-space-detail-actions">
                <Link to={`/wikis/${spaceId}/graph`} className="btn btn-secondary">
                  <Network size={18} />
                  {t('graphView')}
                </Link>
                <button
                  type="button"
                  className="btn btn-secondary wiki-space-detail-import-folder-btn"
                  title={t('importFolderTitle')}
                  disabled={vaultImporting || vaultFolderModalOpen}
                  onClick={openVaultFolderModal}
                >
                  <FolderUp size={18} />
                  {t('importFolder')}
                </button>
                <label
                  className="btn btn-secondary wiki-space-detail-import-label"
                  title={t('importZipTitle')}
                >
                  <input
                    type="file"
                    className="wiki-space-detail-file-input-overlay"
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
            </header>

            <div className="wiki-space-detail-tabs" role="tablist" aria-label={t('tabsAriaLabel')}>
              <button
                type="button"
                role="tab"
                aria-selected={mainTab === 'pages'}
                className={`wiki-space-detail-tab${mainTab === 'pages' ? ' wiki-space-detail-tab--active' : ''}`}
                onClick={() => setMainTab('pages')}
              >
                <FileText size={16} aria-hidden />
                {t('tabPages')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mainTab === 'documents'}
                className={`wiki-space-detail-tab${mainTab === 'documents' ? ' wiki-space-detail-tab--active' : ''}`}
                onClick={() => setMainTab('documents')}
              >
                <FileStack size={16} aria-hidden />
                {t('tabDocuments')}
              </button>
            </div>

            {mainTab === 'pages' && (
              <section
                className={`wiki-space-detail-section${pagesTotal > 0 ? ' wiki-space-detail-section--tight' : ''}`}
                aria-label={t('pagesSectionAria')}
              >
                {pagesTotal === 0 ? (
                  <p className="wiki-space-detail-muted">{t('noPagesYet')}</p>
                ) : (
                  <>
                    <ul className="wiki-space-detail-pages">
                      {pages.map((p) => (
                        <li key={p.id} className="wiki-space-detail-page-row">
                          <Link to={`/wikis/${spaceId}/pages/${p.id}`} className="wiki-space-detail-page-link">
                            <FileText size={18} strokeWidth={1.5} className="wiki-space-detail-page-icon" aria-hidden />
                            <span className="wiki-space-detail-page-path">{p.path}</span>
                          </Link>
                          <time
                            className="wiki-space-detail-page-updated"
                            dateTime={p.updated_at}
                            title={p.updated_at}
                          >
                            {formatRowUpdatedAt(p.updated_at, t('dashDate'))}
                          </time>
                          <button
                            type="button"
                            className="wiki-space-detail-icon-btn"
                            aria-label={t('deletePageAria')}
                            onClick={() => void handleDeletePage(p)}
                          >
                            <Trash2 size={18} strokeWidth={1.5} />
                          </button>
                        </li>
                      ))}
                    </ul>
                    {pageCount > 1 && (
                      <nav className="wiki-space-detail-pagination" aria-label={t('paginationAria')}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={pageIndex <= 0}
                          onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                        >
                          {t('previous')}
                        </button>
                        <span className="wiki-space-detail-pagination-status">
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
            )}

            {mainTab === 'documents' && (
              <section className="wiki-space-detail-section" aria-labelledby="wiki-tab-docs-heading">
                <div className="wiki-space-detail-documents-head">
                  <h2 id="wiki-tab-docs-heading" className="wiki-space-detail-section-title">
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
                {linkedDocs.length === 0 ? (
                  <p className="wiki-space-detail-muted">{t('noLinkedDocsHint')}</p>
                ) : (
                  <ul className="wiki-space-detail-pages">
                    {linkedDocs.map((d) => (
                      <li key={d.id} className="wiki-space-detail-page-row">
                        <Link to={`/documents/view/${d.id}`} className="wiki-space-detail-page-link">
                          <FileStack size={18} strokeWidth={1.5} className="wiki-space-detail-page-icon" aria-hidden />
                          <span className="wiki-space-detail-page-path">{d.name}</span>
                        </Link>
                        <time
                          className="wiki-space-detail-page-updated"
                          dateTime={d.updated_at}
                          title={d.updated_at}
                        >
                          {formatRowUpdatedAt(d.updated_at, t('dashDate'))}
                        </time>
                        <button
                          type="button"
                          className="wiki-space-detail-icon-btn"
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
            )}
          </div>
          {wikiAssistantCollapsed ? (
            <button
              type="button"
              className="wiki-space-detail-agent-expand"
              onClick={expandWikiAssistant}
              title={t('expandCopilot')}
              aria-expanded="false"
            >
              <span className="wiki-space-detail-agent-expand__icon" aria-hidden>
                <Bot size={20} strokeWidth={2} />
                <ChevronsLeft size={18} strokeWidth={2} />
              </span>
              <span className="wiki-space-detail-agent-expand__label">{t('copilotLabel')}</span>
            </button>
          ) : (
            <div className="wiki-space-detail-agent-rail">
              <WikiSpaceAgentPanel
                spaceId={spaceId}
                spaceName={space.name}
                onRequestCollapse={collapseWikiAssistant}
              />
            </div>
          )}
          </div>
        )}
      </div>

      {docPickerOpen && spaceId && (
        <div
          className="wiki-space-detail-modal-overlay"
          role="presentation"
          onClick={() => setDocPickerOpen(false)}
        >
          <div
            className="wiki-space-detail-modal wiki-space-detail-doc-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wiki-doc-picker-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h3 id="wiki-doc-picker-title">{t('docPickerTitle')}</h3>
            <p className="wiki-space-detail-muted wiki-space-detail-doc-picker-hint">{t('docPickerHint')}</p>
            <div className="wiki-space-detail-doc-picker-filters">
              <label className="wiki-space-detail-doc-picker-label">
                {t('channel')}
                <select
                  className="wiki-space-detail-doc-picker-select"
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
              <label className="wiki-space-detail-doc-picker-label wiki-space-detail-doc-picker-label--grow">
                {t('searchByName')}
                <input
                  type="search"
                  className="wiki-space-detail-doc-picker-input"
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  placeholder={t('filterPlaceholder')}
                />
              </label>
            </div>
            <div className="wiki-space-detail-doc-picker-list" role="listbox" aria-label={t('docResultsAria')}>
              {docPickerLoading ? (
                <p className="wiki-space-detail-muted">{t('docPickerLoading')}</p>
              ) : docPickerItems.length === 0 ? (
                <p className="wiki-space-detail-muted">{t('noDocumentsMatch')}</p>
              ) : (
                <ul className="wiki-space-detail-doc-picker-ul">
                  {docPickerItems.map((d) => {
                    const already = linkedDocs.some((l) => l.id === d.id);
                    return (
                      <li key={d.id} className="wiki-space-detail-doc-picker-row">
                        <span className="wiki-space-detail-doc-picker-name" title={d.name}>
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
            <div className="wiki-space-detail-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDocPickerOpen(false)}>
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {vaultFolderModalOpen && (
        <div
          className="wiki-space-detail-modal-overlay wiki-space-detail-vault-options-overlay"
          role="presentation"
          onClick={() => cancelVaultFolderModal()}
        >
          <div
            className="wiki-space-detail-modal wiki-space-detail-vault-options"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vault-import-options-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h3 id="vault-import-options-title">{t('vaultModalTitle')}</h3>
            <p className="wiki-space-detail-vault-options-hint">{t('vaultModalHint')}</p>
            <ul className="wiki-space-detail-vault-options-list">
              <li>
                <label className="wiki-space-detail-vault-options-row">
                  <input
                    type="checkbox"
                    checked={vaultSkipOpts.skipPdf}
                    onChange={(ev) => setVaultSkipOpts((o) => ({ ...o, skipPdf: ev.target.checked }))}
                  />
                  <span>{t('skipPdf')}</span>
                </label>
              </li>
              <li>
                <label className="wiki-space-detail-vault-options-row">
                  <input
                    type="checkbox"
                    checked={vaultSkipOpts.skipDocx}
                    onChange={(ev) => setVaultSkipOpts((o) => ({ ...o, skipDocx: ev.target.checked }))}
                  />
                  <span>{t('skipDocx')}</span>
                </label>
              </li>
              <li>
                <label className="wiki-space-detail-vault-options-row">
                  <input
                    type="checkbox"
                    checked={vaultSkipOpts.skipDoc}
                    onChange={(ev) => setVaultSkipOpts((o) => ({ ...o, skipDoc: ev.target.checked }))}
                  />
                  <span>{t('skipDoc')}</span>
                </label>
              </li>
              <li>
                <label className="wiki-space-detail-vault-options-row">
                  <input
                    type="checkbox"
                    checked={vaultSkipOpts.skipPptx}
                    onChange={(ev) => setVaultSkipOpts((o) => ({ ...o, skipPptx: ev.target.checked }))}
                  />
                  <span>{t('skipPptx')}</span>
                </label>
              </li>
              <li>
                <label className="wiki-space-detail-vault-options-row">
                  <input
                    type="checkbox"
                    checked={vaultSkipOpts.skipPpt}
                    onChange={(ev) => setVaultSkipOpts((o) => ({ ...o, skipPpt: ev.target.checked }))}
                  />
                  <span>{t('skipPpt')}</span>
                </label>
              </li>
            </ul>
            <div className="wiki-space-detail-modal-actions wiki-space-detail-vault-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={cancelVaultFolderModal}>
                {t('cancel')}
              </button>
              <label className="btn btn-primary wiki-space-detail-import-label wiki-space-detail-modal-folder-label">
                <input
                  type="file"
                  className="wiki-space-detail-file-input-overlay"
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
        <div className="wiki-space-detail-import-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="wiki-space-detail-import-dialog">
            <h3 className="wiki-space-detail-import-title">{t('importingTitle')}</h3>
            <p className="wiki-space-detail-import-phase">
              {progressDisplay.phase === 'binary' ? t('phaseUploadBinary') : t('phaseImportMd')}
            </p>
            <p className="wiki-space-detail-import-path" title={progressDisplay.path}>
              {progressDisplay.path}
            </p>
            <div className="wiki-space-detail-import-bar wiki-space-detail-import-bar--overall">
              <div
                className="wiki-space-detail-import-bar-fill"
                style={{ width: `${importOverallPercent}%` }}
              />
            </div>
            <p className="wiki-space-detail-import-count">
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
                  <p className="wiki-space-detail-import-bytes">
                    {formatBytes(progressDisplay.fileLoaded ?? 0)} / {formatBytes(progressDisplay.fileTotal)}
                  </p>
                  <div className="wiki-space-detail-import-bar">
                    <div
                      className="wiki-space-detail-import-bar-fill"
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
        <div className="wiki-space-detail-modal-overlay" role="presentation" onClick={() => setShowNewPage(false)}>
          <div
            className="wiki-space-detail-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{t('newPageModalTitle')}</h3>
            <label>
              {t('pathRequired')} <span className="wiki-space-detail-req">*</span>
              <input
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder={t('pathPlaceholder')}
              />
            </label>
            <div className="wiki-space-detail-modal-actions">
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
