import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Play, Save, Trash2 } from 'lucide-react';
import { AvailableQueriesPanel } from './AvailableQueriesPanel';
import { FunctionCodeEditor } from './FunctionCodeEditor';
import { FunctionPreviewPanel } from './FunctionPreviewPanel';
import { useFunctionEditorWorkspace } from './useFunctionEditorWorkspace';
import './function-editor.scss';

export function FunctionEditorWorkspacePage() {
  const {
    t,
    isNew,
    apiName,
    setApiName,
    displayName,
    setDisplayName,
    sourceCode,
    setSourceCode,
    previewInput,
    setPreviewInput,
    previewOutput,
    loading,
    saving,
    running,
    resolvedId,
    insertSnippet,
    onSave,
    onValidate,
    onRun,
    onDelete,
  } = useFunctionEditorWorkspace();

  if (loading) {
    return (
      <div className="function-editor-loading">
        <Loader2 className="spin" size={24} aria-hidden />
        <p>{t('shared.loading')}</p>
      </div>
    );
  }

  return (
    <div className="function-editor-workspace">
      <header className="function-editor-workspace__topbar">
        <Link to="/function-editor" className="function-editor-workspace__back">
          <ArrowLeft size={16} aria-hidden />
          {t('editor.allFunctions')}
        </Link>
        <div className="function-editor-workspace__title-block">
          <span className="function-editor-workspace__name">{isNew ? t('editor.create') : displayName || apiName}</span>
          {!isNew && apiName && <span className="function-editor-workspace__api">{apiName}</span>}
        </div>
        <div className="function-editor-workspace__actions">
          {!isNew && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void onDelete()}>
              <Trash2 size={16} aria-hidden />
              {t('shared.delete')}
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void onValidate()} disabled={!resolvedId}>
            {t('shared.validate')}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void onRun()} disabled={!resolvedId || running}>
            <Play size={16} aria-hidden />
            {t('shared.run')}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void onSave()}
            disabled={saving || (isNew && !apiName)}
          >
            <Save size={16} aria-hidden />
            {saving ? t('shared.saving') : t('shared.save')}
          </button>
        </div>
      </header>

      {isNew && (
        <div className="function-editor-workspace__meta">
          <label>
            {t('editor.apiName')}
            <input value={apiName} onChange={(e) => setApiName(e.target.value)} className="console-form-control" />
          </label>
          <label>
            {t('editor.displayName')}
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="console-form-control" />
          </label>
        </div>
      )}

      <div className="function-editor-workspace__main">
        <div className="function-editor-workspace__center">
          <section className="function-editor-workspace__editor" aria-label={t('editor.sourceCode')}>
            <div className="function-editor-workspace__editor-header">
              <span className="function-editor-workspace__editor-title">{t('editor.sourceCode')}</span>
              <span className="function-editor-workspace__lang-badge">Python</span>
            </div>
            <div className="function-editor-workspace__editor-body">
              <FunctionCodeEditor
                value={sourceCode}
                onChange={setSourceCode}
                ariaLabel={t('editor.sourceCode')}
              />
            </div>
          </section>

          <FunctionPreviewPanel
            input={previewInput}
            output={previewOutput}
            running={running}
            canRun={Boolean(resolvedId)}
            onInputChange={setPreviewInput}
            onRun={() => void onRun()}
          />
        </div>
        <AvailableQueriesPanel currentApiName={apiName || undefined} onInsertSnippet={insertSnippet} />
      </div>
    </div>
  );
}
