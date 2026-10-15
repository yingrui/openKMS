import { Folder, File, FolderUp, Upload, GitBranch, Loader2, RefreshCw, ChevronLeft, Trash2, X, FileDiff, History, Check, Plus, Minus, ChevronDown, ArrowDown, ArrowUp } from 'lucide-react';
import { AgentFileViewer } from './AgentFileViewer';
import { AgentDiffViewer } from './AgentDiffViewer';
import './AgentsWorkspace.scss';
import type { InputHTMLAttributes } from 'react';
import { useAgentFiles } from './useAgentFiles';
import {
  type AgentFilesPanelProps, TREE_MAX_PX, TREE_MIN_PX, clampTreeWidth, isProtectedProjectPath, relativeTime,
} from './agentsFilesUtils';
export function AgentFilesPanel({
  projectId,
  gitInitialized,
  railWidthPx,
  onRailWidthChange,
  onGitChange,
  variant = 'rail',
  onCloseSheet,
}: AgentFilesPanelProps) {
  const {
    t, cwd, setCwd, entries, selected, preview, previewBinary, previewLoading, gitBranch,
    gitAhead, gitBehind, gitRemoteUrl, lastCommit, gitLogEntries, setPanelMode, commitMenuOpen,
    setCommitMenuOpen, commitMenuRef, commitMsg, setCommitMsg, committing, syncing, busyPath,
    diffPath, diffText, diffLoading, uploadFilesRef, uploadFolderRef, uploadMenuRef, uploadMenuOpen,
    setUploadMenuOpen, uploading, refreshing, deletingPath, viewerWidthPx, fileOpen, onTreeResizePointerDown,
    stagedFiles, unstagedFiles, gitBadge, closeFile, openFile, onRefresh, goUp,
    onDeleteEntry, onUploadPick, onGitInit, onCommit, onSync, onStageAll, onUnstageAll, renderScmRow,
    changeCount, stagedCount, unstagedCount, canPush, scmOpen, uploadTargetLabel, headTitle,
    treeWidth, isSheet, railStyle, treeStyle,
  } = useAgentFiles({
    projectId,
    gitInitialized,
    railWidthPx,
    onRailWidthChange,
    onGitChange,
    variant,
  });

  return (
    <div
      className={`agents-files-rail${fileOpen ? ' agents-files-rail--open' : ''}${isSheet ? ' agents-files-rail--sheet' : ''}`}
      style={railStyle}
    >
      {fileOpen && diffPath ? (
        <AgentDiffViewer
          path={diffPath}
          diff={diffText}
          loading={diffLoading}
          onClose={closeFile}
        />
      ) : null}
      {/* fileOpen ⇒ selected is set; `?? ''` only satisfies the prop type */}
      {fileOpen && !diffPath ? (
        <AgentFileViewer
          path={selected ?? ''}
          content={preview ?? ''}
          isBinary={previewBinary}
          loading={previewLoading}
          onClose={closeFile}
          onOpenWorkspaceFile={(p) => void openFile(p, false)}
        />
      ) : null}
      {fileOpen && !isSheet ? (
        <div
          className="agents-pane-resize-handle agents-pane-resize-handle--inner"
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={treeWidth}
          aria-valuemin={TREE_MIN_PX}
          aria-valuemax={clampTreeWidth(TREE_MAX_PX, railWidthPx, viewerWidthPx)}
          aria-label={t('workspace.resizeFileTree')}
          title={t('workspace.resizeFileTreeHint')}
          onMouseDown={onTreeResizePointerDown}
        />
      ) : null}
      <aside
        className={`agents-files-panel${fileOpen ? ' agents-files-panel--split' : ''}`}
        style={treeStyle}
        aria-label={t('files.title')}
      >
        <div className="agents-files-head">
          <div className="agents-files-head-title-row">
            {!scmOpen && cwd ? (
              <button
                type="button"
                className="agents-files-back-btn"
                onClick={goUp}
                title={t('files.goUpHint')}
                aria-label={t('files.goUp')}
              >
                <ChevronLeft size={16} />
              </button>
            ) : null}
            <span className="agents-files-head-title" title={!scmOpen ? cwd || undefined : undefined}>
              {headTitle}
            </span>
          </div>
          <div className="agents-files-head-actions">
            {!scmOpen ? (
              <div className="agents-files-upload" ref={uploadMenuOpen ? uploadMenuRef : undefined}>
                {uploadMenuOpen ? (
                  <div className="agents-files-upload-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      className="agents-files-upload-menu-item"
                      disabled={uploading}
                      onClick={() => uploadFilesRef.current?.click()}
                      title={t('files.uploadFilesHint', { path: uploadTargetLabel })}
                    >
                      <Upload size={14} />
                      <span>{t('files.uploadFiles')}</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="agents-files-upload-menu-item"
                      disabled={uploading}
                      onClick={() => uploadFolderRef.current?.click()}
                      title={t('files.uploadFolderHint', { path: uploadTargetLabel })}
                    >
                      <FolderUp size={14} />
                      <span>{t('files.uploadFolder')}</span>
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="agents-files-icon-btn"
                  onClick={() => setUploadMenuOpen((v) => !v)}
                  title={t('files.upload')}
                  aria-label={t('files.upload')}
                  aria-expanded={uploadMenuOpen}
                  aria-haspopup="menu"
                  disabled={uploading}
                >
                  {uploading ? <Loader2 size={15} className="agents-session-more-spinner" /> : <Upload size={15} />}
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="agents-files-icon-btn"
              onClick={() => void onRefresh()}
              title={t('files.refreshHint')}
              aria-label={t('files.refresh')}
              disabled={refreshing || uploading}
            >
              {refreshing ? (
                <Loader2 size={15} className="agents-session-more-spinner" />
              ) : (
                <RefreshCw size={15} />
              )}
            </button>
            <input
              ref={uploadFilesRef}
              type="file"
              hidden
              multiple
              onChange={(e) => void onUploadPick(e.target.files, false)}
            />
            <input
              ref={uploadFolderRef}
              type="file"
              hidden
              multiple
              {...({ webkitdirectory: '', directory: '' } as InputHTMLAttributes<HTMLInputElement>)}
              onChange={(e) => void onUploadPick(e.target.files, true)}
            />
            {!gitInitialized ? (
              <button
                type="button"
                className="agents-files-icon-btn"
                onClick={() => void onGitInit()}
                title={t('files.gitInit')}
                aria-label={t('files.gitInit')}
              >
                <GitBranch size={15} />
              </button>
            ) : (
              <button
                type="button"
                className={`agents-files-icon-btn${scmOpen ? ' agents-files-icon-btn--active' : ''}`}
                onClick={() => setPanelMode((m) => (m === 'scm' ? 'files' : 'scm'))}
                title={scmOpen ? t('files.showFiles') : t('files.sourceControl')}
                aria-label={scmOpen ? t('files.showFiles') : t('files.sourceControl')}
                aria-pressed={scmOpen}
              >
                <GitBranch size={15} />
                {changeCount > 0 ? (
                  <span className="agents-files-git-count" aria-hidden>
                    {changeCount > 99 ? '99+' : changeCount}
                  </span>
                ) : null}
              </button>
            )}
            {!scmOpen && !cwd ? (
              <span className="agents-files-all-btn agents-files-all-btn--static">{t('files.allFiles')}</span>
            ) : !scmOpen ? (
              <button
                type="button"
                className="agents-files-all-btn"
                onClick={() => {
                  setCwd('');
                  closeFile();
                }}
                title={t('files.allFilesHint')}
              >
                {t('files.allFiles')}
              </button>
            ) : (
              <button
                type="button"
                className="agents-files-all-btn"
                onClick={() => setPanelMode('files')}
                title={t('files.showFiles')}
              >
                {t('files.allFiles')}
              </button>
            )}
            {onCloseSheet ? (
              <button
                type="button"
                className="agents-files-icon-btn"
                onClick={onCloseSheet}
                aria-label={t('workspace.closeFiles')}
                title={t('workspace.closeFiles')}
              >
                <X size={16} />
              </button>
            ) : null}
          </div>
        </div>
        {scmOpen ? (
          <div className="agents-scm">
            <div className="agents-scm-meta">
              {gitBranch ? (
                <span className="agents-scm-branch" title={gitBranch}>
                  <GitBranch size={12} aria-hidden />
                  {gitBranch}
                </span>
              ) : null}
              {gitRemoteUrl ? (
                <span className="agents-scm-sync" title={gitRemoteUrl}>
                  <button
                    type="button"
                    className="agents-scm-sync-btn"
                    disabled={!canPush || syncing}
                    title={t('files.pull')}
                    aria-label={t('files.pull')}
                    onClick={() => void onSync('pull')}
                  >
                    {syncing ? (
                      <Loader2 size={12} className="agents-session-more-spinner" />
                    ) : (
                      <ArrowDown size={12} aria-hidden />
                    )}
                    {gitBehind ?? 0}
                  </button>
                  <button
                    type="button"
                    className="agents-scm-sync-btn"
                    disabled={!canPush || syncing}
                    title={t('files.push')}
                    aria-label={t('files.push')}
                    onClick={() => void onSync('push')}
                  >
                    <ArrowUp size={12} aria-hidden />
                    {gitAhead ?? 0}
                  </button>
                </span>
              ) : null}
              <span className="agents-scm-change-count">{t('files.changes', { count: changeCount })}</span>
            </div>

            <div className="agents-scm-commit">
              <textarea
                id="agents-scm-commit-msg"
                className="agents-scm-commit-msg"
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    void onCommit();
                  }
                }}
                placeholder={t('files.commitMessagePlaceholder')}
                rows={2}
                disabled={committing}
              />
              <div className="agents-scm-commit-actions" ref={commitMenuRef}>
                <button
                  type="button"
                  className="btn btn-sm btn-primary agents-scm-commit-btn"
                  disabled={committing || !commitMsg.trim() || stagedCount === 0}
                  onClick={() => void onCommit()}
                >
                  {committing ? (
                    <>
                      <Loader2 size={14} className="agents-session-more-spinner" />
                      {t('files.committing')}
                    </>
                  ) : (
                    <>
                      <Check size={14} aria-hidden />
                      {t('files.commit')}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="agents-scm-commit-more"
                  title={t('files.commitOptions')}
                  aria-label={t('files.commitOptions')}
                  aria-expanded={commitMenuOpen}
                  aria-haspopup="menu"
                  disabled={committing}
                  onClick={() => setCommitMenuOpen((v) => !v)}
                >
                  <ChevronDown size={14} aria-hidden />
                </button>
                {commitMenuOpen ? (
                  <div className="agents-scm-commit-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      disabled={!commitMsg.trim() || unstagedCount === 0}
                      onClick={() => void onCommit({ stageAll: true })}
                    >
                      {t('files.commitAll')}
                    </button>
                    {canPush ? (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={!commitMsg.trim()}
                        onClick={() => void onCommit({ stageAll: stagedCount === 0, push: true })}
                      >
                        {t('files.commitAndPush')}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div
              className={`agents-scm-changes${changeCount === 0 ? ' agents-scm-changes--empty' : ''}`}
              aria-label={t('files.changesSection')}
            >
              {changeCount === 0 ? (
                <div className="agents-scm-empty">
                  <FileDiff size={18} strokeWidth={1.4} aria-hidden />
                  <span>{t('files.noChanges')}</span>
                </div>
              ) : (
                <>
                  {stagedCount > 0 ? (
                    <div className="agents-scm-group">
                      <div className="agents-scm-group-head">
                        <span className="agents-scm-group-title">
                          {t('files.stagedChanges', { count: stagedCount })}
                        </span>
                        <button
                          type="button"
                          className="agents-scm-group-btn"
                          title={t('files.unstageAll')}
                          aria-label={t('files.unstageAll')}
                          disabled={busyPath !== null}
                          onClick={() => void onUnstageAll()}
                        >
                          <Minus size={13} aria-hidden />
                        </button>
                      </div>
                      {stagedFiles.map((e) => renderScmRow(e, true))}
                    </div>
                  ) : null}
                  {unstagedCount > 0 ? (
                    <div className="agents-scm-group">
                      <div className="agents-scm-group-head">
                        <span className="agents-scm-group-title">
                          {t('files.changesGroup', { count: unstagedCount })}
                        </span>
                        <button
                          type="button"
                          className="agents-scm-group-btn"
                          title={t('files.stageAll')}
                          aria-label={t('files.stageAll')}
                          disabled={busyPath !== null}
                          onClick={() => void onStageAll()}
                        >
                          <Plus size={13} aria-hidden />
                        </button>
                      </div>
                      {unstagedFiles.map((e) => renderScmRow(e, false))}
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {gitLogEntries.length > 0 ? (
              <div className="agents-scm-commits">
                <div className="agents-scm-commits-head">
                  <History size={12} aria-hidden />
                  <span>{t('files.commits', { count: gitLogEntries.length })}</span>
                </div>
                <div className="agents-scm-commits-list">
                  {gitLogEntries.map((c) => (
                    <div key={c.hash} className="agents-scm-commit-row" title={`${c.message}\n${c.author}`}>
                      <span className="agents-scm-commit-hash">{c.hash}</span>
                      <span className="agents-scm-log-msg">{c.message}</span>
                      {c.refs
                        ? c.refs.split(', ').map((ref) => (
                            <span
                              key={ref}
                              className={`agents-scm-ref${ref.startsWith('HEAD') ? ' agents-scm-ref--head' : ''}`}
                            >
                              {ref.replace('HEAD -> ', '')}
                            </span>
                          ))
                        : null}
                      <span className="agents-scm-commit-meta">
                        {c.author} · {relativeTime(c.date)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="agents-files-tree">
              {entries.map((e) => (
                <div
                  key={e.path}
                  className={`agents-file-row${selected === e.path ? ' agents-file-row--selected' : ''}`}
                  onClick={() => openFile(e.path, e.is_dir)}
                  onKeyDown={(ev) => ev.key === 'Enter' && openFile(e.path, e.is_dir)}
                  role="button"
                  tabIndex={0}
                >
                  {e.is_dir ? <Folder size={14} /> : <File size={14} />}
                  <div className="agents-file-row-label">
                    <span className="agents-file-row-name">{e.name}</span>
                    {(() => {
                      const badge = gitBadge(e.path);
                      return badge ? (
                        <span className="agents-file-badge" title={badge.title}>
                          {badge.short}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  {!isProtectedProjectPath(e.path) ? (
                    <button
                      type="button"
                      className="agents-file-delete"
                      title={e.is_dir ? t('files.deleteFolder') : t('files.deleteFile')}
                      aria-label={e.is_dir ? t('files.deleteFolder') : t('files.deleteFile')}
                      disabled={deletingPath === e.path}
                      onClick={(ev) => void onDeleteEntry(e, ev)}
                    >
                      {deletingPath === e.path ? (
                        <Loader2 size={14} className="agents-session-more-spinner" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            {lastCommit && !fileOpen ? (
              <div className="agents-files-foot">
                <span>
                  {lastCommit.hash.slice(0, 7)} {lastCommit.message}
                </span>
              </div>
            ) : null}
          </>
        )}
      </aside>
    </div>
  );
}
