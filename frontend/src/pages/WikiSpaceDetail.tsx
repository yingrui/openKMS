import { useCallback, useEffect, useState, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, FolderUp, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  createWikiPage,
  deleteWikiPage,
  defaultVaultImportSkipOptions,
  fetchWikiPages,
  fetchWikiSpace,
  importWikiVaultFolder,
  importWikiVaultZip,
  type VaultImportSkipOptions,
  type VaultImportProgress,
  vaultSkipExtensionSet,
  type WikiPageResponse,
  type WikiSpaceResponse,
  type WikiVaultImportResponse,
} from '../data/wikiSpacesApi';
import './WikiSpaceDetail.css';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function WikiSpaceDetail() {
  const { id: spaceId } = useParams<{ id: string }>();
  const [space, setSpace] = useState<WikiSpaceResponse | null>(null);
  const [pages, setPages] = useState<WikiPageResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewPage, setShowNewPage] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [saving, setSaving] = useState(false);
  const [vaultImporting, setVaultImporting] = useState(false);
  const [vaultProgress, setVaultProgress] = useState<VaultImportProgress | null>(null);
  /** Modal: skip options + folder picker; import runs as soon as the browser exposes files (after its upload confirmation). */
  const [vaultFolderModalOpen, setVaultFolderModalOpen] = useState(false);
  const [vaultSkipOpts, setVaultSkipOpts] = useState<VaultImportSkipOptions>(() => defaultVaultImportSkipOptions());

  const load = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    try {
      const [sp, pg] = await Promise.all([fetchWikiSpace(spaceId), fetchWikiPages(spaceId)]);
      setSpace(sp);
      setPages(pg.items);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
      setSpace(null);
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

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
      void load();
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
      void load();
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
      void load();
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
      void load();
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

  return (
    <div className="wiki-space-detail">
      <div className="wiki-space-detail-toolbar">
        <Link to="/wikis" className="wiki-space-detail-back">
          <ArrowLeft size={18} />
          Wiki spaces
        </Link>
      </div>

      {loading && <p className="wiki-space-detail-muted">Loading…</p>}

      {!loading && space && (
        <>
          <header className="wiki-space-detail-header">
            <div>
              <h1>{space.name}</h1>
              {space.description && <p className="wiki-space-detail-desc">{space.description}</p>}
            </div>
            <div className="wiki-space-detail-actions">
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

          <section className="wiki-space-detail-section">
            <h2>Pages</h2>
            {pages.length === 0 ? (
              <p className="wiki-space-detail-muted">No pages yet.</p>
            ) : (
              <ul className="wiki-space-detail-pages">
                {pages.map((p) => (
                  <li key={p.id} className="wiki-space-detail-page-row">
                    <Link to={`/wikis/${spaceId}/pages/${p.id}`} className="wiki-space-detail-page-link">
                      <FileText size={18} />
                      <span className="wiki-space-detail-page-path">{p.path}</span>
                    </Link>
                    <button
                      type="button"
                      className="wiki-space-detail-icon-btn"
                      aria-label="Delete page"
                      onClick={() => void handleDeletePage(p)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
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
