import { Link } from 'react-router-dom';
import { ArrowLeft, FlaskConical, Loader2, Play, Plug, Rocket, Save, Trash2 } from 'lucide-react';
import { AvailableQueriesPanel } from './AvailableQueriesPanel';
import { FunctionCodeEditor } from './FunctionCodeEditor';
import { FunctionPreviewPanel } from './FunctionPreviewPanel';
import { LogicFlowEditor } from './LogicFlowEditor';
import { LogicRunPanel } from './LogicRunPanel';
import { LogicTracePanel } from './LogicTracePanel';
import { useFunctionEditorWorkspace } from './useFunctionEditorWorkspace';
import './function-editor.scss';

/** The last run's per-node values, keyed by node id, so each card can show what it produced. */
function traceValuesByNode(trace: Record<string, unknown> | null): Record<
  string,
  { output?: unknown; error?: string; tokens?: number; ms?: number }
> {
  const nodes = Array.isArray(trace?.nodes) ? (trace?.nodes as Record<string, unknown>[]) : [];
  const out: Record<string, { output?: unknown; error?: string; tokens?: number; ms?: number }> = {};
  for (const node of nodes) {
    const id = String(node.id ?? '');
    if (!id) continue;
    const usage = (node.usage ?? {}) as { total_tokens?: number };
    out[id] = {
      output: node.output,
      error: typeof node.error === 'string' ? node.error : undefined,
      tokens: usage.total_tokens,
      ms: typeof node.duration_ms === 'number' ? node.duration_ms : undefined,
    };
  }
  return out;
}

export function FunctionEditorWorkspacePage() {
  const {
    t,
    isNew,
    backTo,
    isLogic,
    flow,
    setFlow,
    flowErrors,
    models,
    trace,
    runValues,
    setRunValues,
    pickedInstances,
    setPickedInstances,
    recentRuns,
    onSelectRun,
    canPublish,
    publishing,
    onPublish,
    apiName,
    setApiName,
    displayName,
    setDisplayName,
    objectTypeId,
    setObjectTypeId,
    objectTypes,
    sourceCode,
    setSourceCode,
    inputSchemaText,
    setInputSchemaText,
    outputSchemaText,
    setOutputSchemaText,
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

  const runValuesByNode = traceValuesByNode(trace);
  const objectTypeIdsByName: Record<string, string> = {};
  const objectPropertiesByName: Record<string, string[]> = {};
  for (const type of objectTypes) {
    if (!type.api_name) continue;
    objectTypeIdsByName[type.api_name] = type.id;
    objectPropertiesByName[type.api_name] = (type.properties ?? []).map((prop) => prop.name);
  }

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
        <Link to={backTo} className="function-editor-workspace__back">
          <ArrowLeft size={16} aria-hidden />
          {isLogic ? t('editor.logicTitle') : t('editor.allFunctions')}
        </Link>
        <div className="function-editor-workspace__title-block">
          <span className="function-editor-workspace__name">{isNew ? t('editor.create') : displayName || apiName}</span>
          {!isNew && apiName && <span className="function-editor-workspace__api">{apiName}</span>}
        </div>
        <div className="function-editor-workspace__actions">
          <Link
            to="/external-services"
            className="btn btn-secondary btn-sm"
            title={t('editor.external.pageSubtitle')}
          >
            <Plug size={16} aria-hidden />
            {t('editor.external.button')}
          </Link>
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
          {!isNew && resolvedId ? (
            // One link into the evaluation: an existing one for this function, or a prefilled new one there.
            <Link
              to={`/evaluations?function=${resolvedId}`}
              className="btn btn-secondary btn-sm"
              title={t('editor.evaluateHint')}
            >
              <FlaskConical size={16} aria-hidden />
              {t('editor.evaluate')}
            </Link>
          ) : null}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void onPublish()}
            disabled={!canPublish}
            title={canPublish ? t('functions.publish') : t('editor.publishUpToDate')}
          >
            <Rocket size={16} aria-hidden />
            {publishing ? t('editor.publishing') : t('editor.publish')}
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

      <div className="function-editor-workspace__meta">
        {isNew ? (
          <>
            <label>
              {t('editor.apiName')}
              <input value={apiName} onChange={(e) => setApiName(e.target.value)} className="ds-control" />
            </label>
            <label>
              {t('editor.displayName')}
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="ds-control" />
            </label>
            <label>
              {t('editor.objectType')}
              <select
                value={objectTypeId}
                onChange={(e) => setObjectTypeId(e.target.value)}
                className="ds-control"
              >
                <option value="">{t('editor.objectTypeNone')}</option>
                {objectTypes.map((ot) => (
                  <option key={ot.id} value={ot.id}>
                    {ot.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        {/* Code functions declare their I/O as JSON; a Logic function derives both from its prompts and fields. */}
        {isLogic ? null : (
        <label className="function-editor-workspace__schema-field">
          {t('editor.inputSchema')}
          <textarea
            value={inputSchemaText}
            onChange={(e) => setInputSchemaText(e.target.value)}
            className="ds-control"
            rows={4}
            placeholder={t('editor.schemaPlaceholder')}
            spellCheck={false}
          />
        </label>
        )}
        {isLogic ? null : (
        <label className="function-editor-workspace__schema-field">
          {t('editor.outputSchema')}
          <textarea
            value={outputSchemaText}
            onChange={(e) => setOutputSchemaText(e.target.value)}
            className="ds-control"
            rows={4}
            placeholder={t('editor.schemaPlaceholder')}
            spellCheck={false}
          />
        </label>
        )}
      </div>

      <div className="function-editor-workspace__main">
        <div className="function-editor-workspace__center">
          <section className="function-editor-workspace__editor" aria-label={t('editor.logicFlow')}>
            <div className="function-editor-workspace__editor-header">
              <span className="function-editor-workspace__editor-title">
                {isLogic ? t('editor.logicFlow') : t('editor.sourceCode')}
              </span>
              <span className="function-editor-workspace__lang-badge">
                {isLogic ? t('editor.logicBadge') : 'Python'}
              </span>
            </div>
            <div className="function-editor-workspace__editor-body">
              {isLogic ? (
                <LogicFlowEditor
                  draft={flow}
                  models={models}
                  errors={flowErrors}
                  runValues={runValuesByNode}
                  objectTypes={objectTypes
                    .map((ot) => ot.api_name)
                    .filter((name): name is string => Boolean(name))}
                  objectProperties={objectPropertiesByName}
                  disabled={saving}
                  onChange={setFlow}
                />
              ) : (
                <FunctionCodeEditor
                  value={sourceCode}
                  onChange={setSourceCode}
                  ariaLabel={t('editor.sourceCode')}
                />
              )}
            </div>
          </section>

          {isLogic ? (
            <>
              <LogicRunPanel
                fields={flow.inputs}
                values={runValues}
                picked={pickedInstances}
                recent={recentRuns}
                objectTypeIds={objectTypeIdsByName}
                running={running}
                canRun={Boolean(resolvedId)}
                onChange={setRunValues}
                onPick={(name, instance) =>
                  setPickedInstances((prev) => ({ ...prev, [name]: instance }))
                }
                onRun={() => void onRun()}
                onSelectRun={onSelectRun}
              />
              <LogicTracePanel trace={trace} />
              {previewOutput ? (
                <section className="logic-run">
                  <span className="logic-run__title">{t('editor.previewOutput')}</span>
                  <pre className="logic-trace__pre">{previewOutput}</pre>
                </section>
              ) : null}
            </>
          ) : (
            <FunctionPreviewPanel
              input={previewInput}
              output={previewOutput}
              running={running}
              canRun={Boolean(resolvedId)}
              onInputChange={setPreviewInput}
              onRun={() => void onRun()}
            />
          )}
        </div>
        {isLogic ? null : (
          <AvailableQueriesPanel currentApiName={apiName || undefined} onInsertSnippet={insertSnippet} />
        )}
      </div>
    </div>
  );
}
