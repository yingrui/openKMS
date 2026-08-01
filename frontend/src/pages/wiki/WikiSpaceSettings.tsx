import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileStack, FileText, FolderUp, Network, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import { ResourceSharePanel } from '../../components/ResourceSharePanel';
import { ContentCommentsShell } from '../../components/comments/ContentCommentsShell';
import { RESOURCE_TYPES } from '../../data/resourceAclApi';
import { PanelToolbar } from '../../styles/design-system';
import { WIKI_PAGES_LIST_PAGE_SIZE } from '../../data/wikiSpacesApi';
import { useWikiSpaceSettings } from './useWikiSpaceSettings';
import { WikiSpaceSettingsModals } from './WikiSpaceSettings.modals';
import './WikiSpaceSettings.scss';

function formatRowUpdatedAt(iso: string, dash: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return dash;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function WikiSpaceSettings() {
  const { id: spaceId } = useParams<{ id: string }>();
  const v = useWikiSpaceSettings(spaceId);
  const { t } = v;

  if (!spaceId) {
    return <p className="wiki-space-settings-muted">{t('missingSpaceId')}</p>;
  }

  return (
    <ContentCommentsShell resourceType="wiki_space" resourceId={spaceId ?? ''} enabled={Boolean(spaceId)}>
    <div className="wiki-space-settings">
      <div className="wiki-space-settings-body">
        <div className="wiki-space-settings-toolbar-span">
          <Link to="/wikis" className="wiki-space-settings-back">
            <ArrowLeft size={18} />
            {t('back')}
          </Link>
        </div>
        {v.loading && (
          <p className="wiki-space-settings-body-loading wiki-space-settings-muted">{t('loading')}</p>
        )}
        {!v.loading && !v.space && (
          <p className="wiki-space-settings-body-loading wiki-space-settings-muted" role="alert">
            {t('loadFailed')}
          </p>
        )}
        {!v.loading && v.space && (
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
                    value={v.spaceDraftName}
                    onChange={(e) => v.setSpaceDraftName(e.target.value)}
                    autoComplete="off"
                  />
                </label>
                <label className="wiki-space-settings-field">
                  <span>{t('spaceDescLabel')}</span>
                  <textarea
                    value={v.spaceDraftDesc}
                    onChange={(e) => v.setSpaceDraftDesc(e.target.value)}
                    rows={3}
                  />
                </label>
                <div className="wiki-space-settings-space-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={!v.spaceMetaDirty || v.spaceMetaSaving}
                    onClick={() => {
                      if (!v.space) return;
                      v.setSpaceDraftName(v.space.name);
                      v.setSpaceDraftDesc(v.space.description ?? '');
                    }}
                  >
                    {t('resetEdits')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!v.spaceMetaDirty || v.spaceMetaSaving || !v.spaceDraftName.trim()}
                    onClick={() => void v.handleSaveSpaceMeta()}
                  >
                    {v.spaceMetaSaving ? t('savingSpaceMeta') : t('saveSpaceMeta')}
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
              {v.embeddingModelsLoading ? (
                <p className="wiki-space-settings-muted">{t('semanticModelsLoading')}</p>
              ) : !v.hasEmbeddingCatalog ? (
                <p className="wiki-space-settings-semantic-unavailable wiki-space-settings-muted">{t('semanticNoEmbedding')}</p>
              ) : (
                <div className="wiki-space-settings-semantic-form">
                  <div className="wiki-space-settings-semantic-row">
                    <span className="wiki-space-settings-semantic-label">{t('semanticEmbeddingModelLabel')}</span>
                    <div className="wiki-space-settings-semantic-control">
                      <select
                        className="wiki-space-settings-select"
                        value={v.semanticEmbeddingDraft}
                        onChange={(e) => v.setSemanticEmbeddingDraft(e.target.value)}
                        disabled={v.semanticSettingsSaving || v.vaultImporting || !spaceId || v.semanticIndexing}
                        aria-label={t('semanticEmbeddingModelLabel')}
                      >
                        <option value="">{t('semanticEmbeddingDefaultOption', { name: v.defaultEmbeddingLabel })}</option>
                        {v.embeddingModels
                          .filter((m) => (m.base_url || '').trim().length > 0)
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {v.embeddingModelOneLineLabel(m)}
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
                        value={v.semanticTopKDraft}
                        onChange={(e) => v.setSemanticTopKDraft(Number(e.target.value))}
                        disabled={v.semanticSettingsSaving || v.vaultImporting || !spaceId || v.semanticIndexing}
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
                        value={v.semanticThresholdDraft}
                        onChange={(e) => v.setSemanticThresholdDraft(Number(e.target.value))}
                        disabled={v.semanticSettingsSaving || v.vaultImporting || !spaceId || v.semanticIndexing}
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
                        {v.space?.last_semantic_index_at
                          ? formatRowUpdatedAt(v.space.last_semantic_index_at, t('dashDate'))
                          : t('semanticIndexNever')}
                      </p>
                    </div>
                  </div>
                  <div className="wiki-space-settings-semantic-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={
                        !v.semanticSettingsDirty ||
                        v.semanticSettingsSaving ||
                        v.vaultImporting ||
                        !spaceId ||
                        v.semanticIndexing
                      }
                      onClick={() => void v.handleSaveSemanticSettings()}
                    >
                      {v.semanticSettingsSaving ? t('savingSemanticSettings') : t('saveSemanticSettings')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={v.semanticSettingsSaving || v.vaultImporting || !spaceId || v.semanticIndexing}
                      onClick={() => void v.handleSemanticIndex()}
                    >
                      {v.semanticIndexing ? t('semanticIndexing') : t('semanticIndexBuild')}
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
                  disabled={v.vaultImporting || v.vaultFolderModalOpen}
                  onClick={v.openVaultFolderModal}
                >
                  <FolderUp size={18} />
                  {t('importFolder')}
                </button>
                <label className="btn btn-secondary wiki-space-settings-import-label" title={t('importZipTitle')}>
                  <input
                    type="file"
                    className="wiki-space-settings-file-input-overlay"
                    accept=".zip,application/zip"
                    disabled={v.vaultImporting}
                    onChange={(ev) => void v.handleVaultZipChange(ev)}
                  />
                  <Upload size={18} />
                  {t('importZip')}
                </label>
                <button type="button" className="btn btn-primary" onClick={() => v.setShowNewPage(true)}>
                  <Plus size={18} />
                  {t('newPage')}
                </button>
              </div>
            </section>

            <section
              className={`wiki-space-settings-section wiki-space-settings-card${v.pagesTotal > 0 ? ' wiki-space-settings-section--tight' : ''}`}
              aria-labelledby="wiki-settings-pages-heading"
            >
              <PanelToolbar
                id="wiki-settings-pages-heading"
                className="wiki-space-settings-card-head wiki-space-settings-card-head--split"
                leading={<span className="wiki-space-settings-section-title">{t('sectionPages')}</span>}
                actions={
                  <Link to={`/wikis/${spaceId}/pages/graph`} className="btn btn-secondary btn-sm">
                    {t('browsePagesInWorkspace')}
                  </Link>
                }
              />
              <p className="wiki-space-settings-card-hint wiki-space-settings-muted">{t('sectionPagesHint')}</p>
              {v.pagesTotal === 0 ? (
                <p className="wiki-space-settings-muted">{t('noPagesYet')}</p>
              ) : (
                <>
                  <ul className="wiki-space-settings-pages">
                    {v.pages.map((p) => (
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
                          onClick={() => void v.handleDeletePage(p)}
                        >
                          <Trash2 size={18} strokeWidth={1.5} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {v.pageCount > 1 && (
                    <nav className="wiki-space-settings-pagination" aria-label={t('paginationAria')}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={v.pageIndex <= 0}
                        onClick={() => v.setPageIndex((i) => Math.max(0, i - 1))}
                      >
                        {t('previous')}
                      </button>
                      <span className="wiki-space-settings-pagination-status">
                        {t('paginationStatus', {
                          current: v.pageIndex + 1,
                          total: v.pageCount,
                          count: v.pagesTotal,
                          size: WIKI_PAGES_LIST_PAGE_SIZE,
                        })}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={v.pageIndex >= v.pageCount - 1}
                        onClick={() => v.setPageIndex((i) => Math.min(v.pageCount - 1, i + 1))}
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
                  onClick={v.openDocPicker}
                >
                  {t('addDocuments')}
                </button>
              </div>
              <p className="wiki-space-settings-card-hint wiki-space-settings-muted">{t('sectionLinkedDocsHint')}</p>
              {v.linkedDocs.length === 0 ? (
                <p className="wiki-space-settings-muted">{t('noLinkedDocsHint')}</p>
              ) : (
                <ul className="wiki-space-settings-pages">
                  {v.linkedDocs.map((d) => (
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
                        onClick={() => v.handleRemoveLinkedDoc(d.id)}
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

      <WikiSpaceSettingsModals
        t={t}
        spaceId={spaceId}
        docPickerOpen={v.docPickerOpen}
        docSearch={v.docSearch}
        onDocSearchChange={v.setDocSearch}
        docChannelFilter={v.docChannelFilter}
        onDocChannelFilterChange={v.setDocChannelFilter}
        channelOptions={v.channelOptions}
        docPickerLoading={v.docPickerLoading}
        docPickerItems={v.docPickerItems}
        linkedDocIds={new Set(v.linkedDocs.map((d) => d.id))}
        onCloseDocPicker={() => v.setDocPickerOpen(false)}
        onLinkDoc={v.handleLinkDoc}
        vaultFolderModalOpen={v.vaultFolderModalOpen}
        vaultSkipOpts={v.vaultSkipOpts}
        onVaultSkipOptsChange={v.setVaultSkipOpts}
        vaultImporting={v.vaultImporting}
        onCancelVaultFolderModal={v.cancelVaultFolderModal}
        onVaultFolderChange={(e) => void v.handleVaultFolderChange(e)}
        progressDisplay={v.progressDisplay}
        importOverallPercent={v.importOverallPercent}
        showNewPage={v.showNewPage}
        newPath={v.newPath}
        onNewPathChange={v.setNewPath}
        saving={v.saving}
        onCloseNewPage={() => v.setShowNewPage(false)}
        onCreatePage={() => void v.handleCreatePage()}
      />
    </div>
    </ContentCommentsShell>
  );
}
