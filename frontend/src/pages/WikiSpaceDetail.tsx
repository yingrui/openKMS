import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type InputHTMLAttributes } from 'react';
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

export type WikiLinkedDoc = { id: string; name: string; channel_id: string };

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

export function WikiSpaceDetail() {
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
    const t = window.setTimeout(() => {
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
            toast.error(e instanceof Error ? e.message : 'Failed to load documents');
            setDocPickerItems([]);
          }
        } finally {
          if (!cancelled) setDocPickerLoading(false);
        }
      })();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [docPickerOpen, spaceId, docSearch, docChannelFilter]);

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
          toast.error(e instanceof Error ? e.message : 'Failed to load');
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
  }, [spaceId, pageIndex, listNonce]);

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
      toast.success('Page created');
      window.location.href = `/wikis/${spaceId}/pages/${p.id}`;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
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
      toast.error('No files were selected (or the folder is empty).');
      return;
    }
    const skipSet = vaultSkipExtensionSet(vaultSkipOpts);
    setVaultFolderModalOpen(false);
    setVaultImporting(true);
    setVaultProgress(null);
    try {
      const r = await importWikiVaultFolder(spaceId, files, (p) => setVaultProgress(p), skipSet);
      toast.success(`Vault import: ${summarizeVaultImport(r)}`);
      if (r.warnings.length) {
        toast.warning(
          `${r.warnings.length} warning(s): ${r.warnings.slice(0, 3).join(' · ')}${r.warnings.length > 3 ? '…' : ''}`
        );
      }
      setPageIndex(0);
      setListNonce((n) => n + 1);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Vault import failed');
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
      toast.success(`Vault import: ${summarizeVaultImport(r)}`);
      if (r.warnings.length) {
        toast.warning(
          `${r.warnings.length} warning(s): ${r.warnings.slice(0, 3).join(' · ')}${r.warnings.length > 3 ? '…' : ''}`
        );
      }
      setPageIndex(0);
      setListNonce((n) => n + 1);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Vault import failed');
    } finally {
      setVaultImporting(false);
    }
  };

  const handleDeletePage = async (p: WikiPageResponse) => {
    if (!spaceId || !confirm(`Delete page "${p.path}"?`)) return;
    try {
      await deleteWikiPage(spaceId, p.id);
      toast.success('Page deleted');
      setListNonce((n) => n + 1);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  if (!spaceId) {
    return <p className="wiki-space-detail-muted">Missing space id</p>;
  }

  const progressDisplay: VaultImportProgress = vaultProgress ?? {
    phase: 'binary',
    currentIndex: 0,
    total: 1,
    path: 'Preparing…',
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
            Wiki spaces
          </Link>
        </div>
        {loading && (
          <p className="wiki-space-detail-body-loading wiki-space-detail-muted">Loading…</p>
        )}
        {!loading && !space && (
          <p className="wiki-space-detail-body-loading wiki-space-detail-muted" role="alert">
            Could not load this wiki space.
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
                  Graph View
                </Link>
                <button
                  type="button"
                  className="btn btn-secondary wiki-space-detail-import-folder-btn"
                  title="Upload an Obsidian vault folder (.md + attachments). Skips .obsidian and .trash."
                  disabled={vaultImporting || vaultFolderModalOpen}
                  onClick={openVaultFolderModal}
                >
                  <FolderUp size={18} />
                  Import folder
                </button>
                <label
                  className="btn btn-secondary wiki-space-detail-import-label"
                  title="Upload a zip of your vault (same layout as folder import)."
                >
                  <input
                    type="file"
                    className="wiki-space-detail-file-input-overlay"
                    accept=".zip,application/zip"
                    disabled={vaultImporting}
                    onChange={(ev) => void handleVaultZipChange(ev)}
                  />
                  <Upload size={18} />
                  Import zip
                </label>
                <button type="button" className="btn btn-primary" onClick={() => setShowNewPage(true)}>
                  <Plus size={18} />
                  New page
                </button>
              </div>
            </header>

            <div className="wiki-space-detail-tabs" role="tablist" aria-label="Wiki space sections">
              <button
                type="button"
                role="tab"
                aria-selected={mainTab === 'pages'}
                className={`wiki-space-detail-tab${mainTab === 'pages' ? ' wiki-space-detail-tab--active' : ''}`}
                onClick={() => setMainTab('pages')}
              >
                <FileText size={16} aria-hidden />
                Pages
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mainTab === 'documents'}
                className={`wiki-space-detail-tab${mainTab === 'documents' ? ' wiki-space-detail-tab--active' : ''}`}
                onClick={() => setMainTab('documents')}
              >
                <FileStack size={16} aria-hidden />
                Documents
              </button>
            </div>

            {mainTab === 'pages' && (
              <section
                className={`wiki-space-detail-section${pagesTotal > 0 ? ' wiki-space-detail-section--tight' : ''}`}
                aria-label="Wiki pages in this space"
              >
                {pagesTotal === 0 ? (
                  <p className="wiki-space-detail-muted">No pages yet.</p>
                ) : (
                  <>
                    <ul className="wiki-space-detail-pages">
                      {pages.map((p) => (
                        <li key={p.id} className="wiki-space-detail-page-row">
                          <Link to={`/wikis/${spaceId}/pages/${p.id}`} className="wiki-space-detail-page-link">
                            <FileText size={18} strokeWidth={1.5} className="wiki-space-detail-page-icon" aria-hidden />
                            <span className="wiki-space-detail-page-path">{p.path}</span>
                          </Link>
                          <button
                            type="button"
                            className="wiki-space-detail-icon-btn"
                            aria-label="Delete page"
                            onClick={() => void handleDeletePage(p)}
                          >
                            <Trash2 size={18} strokeWidth={1.5} />
                          </button>
                        </li>
                      ))}
                    </ul>
                    {pageCount > 1 && (
                      <nav className="wiki-space-detail-pagination" aria-label="Pages pagination">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={pageIndex <= 0}
                          onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                        >
                          Previous
                        </button>
                        <span className="wiki-space-detail-pagination-status">
                          Page {pageIndex + 1} of {pageCount} · {pagesTotal} page{pagesTotal === 1 ? '' : 's'} (
                          {WIKI_PAGES_LIST_PAGE_SIZE} per page)
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={pageIndex >= pageCount - 1}
                          onClick={() => setPageIndex((i) => Math.min(pageCount - 1, i + 1))}
                        >
                          Next
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
                    Linked documents
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
                    Add documents…
                  </button>
                </div>
                {linkedDocs.length === 0 ? (
                  <p className="wiki-space-detail-muted">No channel documents linked yet. Use Add documents to pick from your library.</p>
                ) : (
                  <ul className="wiki-space-detail-pages">
                    {linkedDocs.map((d) => (
                      <li key={d.id} className="wiki-space-detail-page-row">
                        <Link to={`/documents/view/${d.id}`} className="wiki-space-detail-page-link">
                          <FileStack size={18} strokeWidth={1.5} className="wiki-space-detail-page-icon" aria-hidden />
                          <span className="wiki-space-detail-page-path">{d.name}</span>
                        </Link>
                        <button
                          type="button"
                          className="wiki-space-detail-icon-btn"
                          aria-label="Remove link"
                          onClick={() => {
                            if (!spaceId) return;
                            void (async () => {
                              try {
                                await unlinkDocumentFromWikiSpace(spaceId, d.id);
                                setLinkedDocs((prev) => prev.filter((x) => x.id !== d.id));
                                toast.success('Link removed');
                              } catch (e: unknown) {
                                toast.error(e instanceof Error ? e.message : 'Failed to remove link');
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
              title="Show wiki assistant"
              aria-expanded="false"
            >
              <span className="wiki-space-detail-agent-expand__icon" aria-hidden>
                <Bot size={20} strokeWidth={2} />
                <ChevronsLeft size={18} strokeWidth={2} />
              </span>
              <span className="wiki-space-detail-agent-expand__label">Wiki assistant</span>
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
            <h3 id="wiki-doc-picker-title">Add documents to this space</h3>
            <p className="wiki-space-detail-muted wiki-space-detail-doc-picker-hint">
              Choose documents you already have in openKMS. Search and optional channel filter use{' '}
              <code className="wiki-space-detail-code">GET /api/documents</code>.
            </p>
            <div className="wiki-space-detail-doc-picker-filters">
              <label className="wiki-space-detail-doc-picker-label">
                Channel
                <select
                  className="wiki-space-detail-doc-picker-select"
                  value={docChannelFilter}
                  onChange={(e) => setDocChannelFilter(e.target.value)}
                >
                  <option value="">All (scoped list)</option>
                  {channelOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wiki-space-detail-doc-picker-label wiki-space-detail-doc-picker-label--grow">
                Search by name
                <input
                  type="search"
                  className="wiki-space-detail-doc-picker-input"
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  placeholder="Filter…"
                />
              </label>
            </div>
            <div className="wiki-space-detail-doc-picker-list" role="listbox" aria-label="Document results">
              {docPickerLoading ? (
                <p className="wiki-space-detail-muted">Loading…</p>
              ) : docPickerItems.length === 0 ? (
                <p className="wiki-space-detail-muted">No documents match.</p>
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
                                  },
                                ]);
                                toast.success('Document linked');
                              } catch (e: unknown) {
                                toast.error(e instanceof Error ? e.message : 'Failed to link document');
                              }
                            })();
                          }}
                        >
                          {already ? 'Linked' : 'Link'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="wiki-space-detail-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDocPickerOpen(false)}>
                Close
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
            <h3 id="vault-import-options-title">Import folder</h3>
            <p className="wiki-space-detail-vault-options-hint">
              Set skip options, then choose your folder. The browser will ask once to allow reading those files (sites cannot
              remove that step). Import starts as soon as you confirm there—no second click in this dialog.
            </p>
            <ul className="wiki-space-detail-vault-options-list">
              <li>
                <label className="wiki-space-detail-vault-options-row">
                  <input
                    type="checkbox"
                    checked={vaultSkipOpts.skipPdf}
                    onChange={(ev) => setVaultSkipOpts((o) => ({ ...o, skipPdf: ev.target.checked }))}
                  />
                  <span>Skip PDF ( .pdf )</span>
                </label>
              </li>
              <li>
                <label className="wiki-space-detail-vault-options-row">
                  <input
                    type="checkbox"
                    checked={vaultSkipOpts.skipDocx}
                    onChange={(ev) => setVaultSkipOpts((o) => ({ ...o, skipDocx: ev.target.checked }))}
                  />
                  <span>Skip Word ( .docx )</span>
                </label>
              </li>
              <li>
                <label className="wiki-space-detail-vault-options-row">
                  <input
                    type="checkbox"
                    checked={vaultSkipOpts.skipDoc}
                    onChange={(ev) => setVaultSkipOpts((o) => ({ ...o, skipDoc: ev.target.checked }))}
                  />
                  <span>Skip Word ( .doc )</span>
                </label>
              </li>
              <li>
                <label className="wiki-space-detail-vault-options-row">
                  <input
                    type="checkbox"
                    checked={vaultSkipOpts.skipPptx}
                    onChange={(ev) => setVaultSkipOpts((o) => ({ ...o, skipPptx: ev.target.checked }))}
                  />
                  <span>Skip PowerPoint ( .pptx )</span>
                </label>
              </li>
              <li>
                <label className="wiki-space-detail-vault-options-row">
                  <input
                    type="checkbox"
                    checked={vaultSkipOpts.skipPpt}
                    onChange={(ev) => setVaultSkipOpts((o) => ({ ...o, skipPpt: ev.target.checked }))}
                  />
                  <span>Skip PowerPoint ( .ppt )</span>
                </label>
              </li>
            </ul>
            <div className="wiki-space-detail-modal-actions wiki-space-detail-vault-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={cancelVaultFolderModal}>
                Cancel
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
                Choose vault folder…
              </label>
            </div>
          </div>
        </div>
      )}

      {vaultImporting && (
        <div className="wiki-space-detail-import-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="wiki-space-detail-import-dialog">
            <h3 className="wiki-space-detail-import-title">Importing vault</h3>
            <p className="wiki-space-detail-import-phase">
              {progressDisplay.phase === 'binary' ? 'Uploading attachment' : 'Importing markdown page'}
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
                ? `File ${progressDisplay.currentIndex} / ${progressDisplay.total}`
                : 'Starting…'}
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
            <h3>New page</h3>
            <label>
              Path <span className="wiki-space-detail-req">*</span>
              <input
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="e.g. guides/onboarding"
              />
            </label>
            <div className="wiki-space-detail-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowNewPage(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving || !newPath.trim()}
                onClick={() => void handleCreatePage()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
