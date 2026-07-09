import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, Play, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULT_FUNCTION_TEMPLATE,
  createOntologyFunction,
  deleteOntologyFunction,
  executeOntologyFunction,
  fetchFunctionVersions,
  fetchOntologyFunction,
  saveFunctionVersion,
  validateFunctionSource,
} from '../../data/ontologyFunctionsApi';
import { FunctionCodeEditor } from './FunctionCodeEditor';
import { FunctionPreviewPanel } from './FunctionPreviewPanel';
import './function-editor.scss';

export function FunctionEditorWorkspacePage() {
  const { t } = useTranslation('ontology');
  const { functionId } = useParams<{ functionId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const isNew = location.pathname.endsWith('/new') || functionId === 'new';

  const [apiName, setApiName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [sourceCode, setSourceCode] = useState(DEFAULT_FUNCTION_TEMPLATE);
  const [previewInput, setPreviewInput] = useState('{\n  "name": "openKMS"\n}');
  const [previewOutput, setPreviewOutput] = useState('');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [resolvedId, setResolvedId] = useState<string | null>(isNew ? null : functionId ?? null);

  const load = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      return;
    }
    if (!functionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const fn = await fetchOntologyFunction(functionId);
      setApiName(fn.api_name);
      setDisplayName(fn.display_name);
      const versions = await fetchFunctionVersions(functionId);
      if (versions[0]) setSourceCode(versions[0].source_code);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('functions.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [functionId, isNew, t]);

  useEffect(() => {
    if (isNew) {
      setLoading(false);
      return;
    }
    if (functionId) setResolvedId(functionId);
    void load();
  }, [functionId, isNew, load]);

  const onSave = async () => {
    setSaving(true);
    try {
      if (isNew) {
        const fn = await createOntologyFunction({
          api_name: apiName,
          display_name: displayName || apiName,
          source_code: sourceCode,
        });
        toast.success(t('editor.created'));
        navigate(`/function-editor/${fn.id}`, { replace: true });
        setResolvedId(fn.id);
      } else if (resolvedId) {
        await saveFunctionVersion(resolvedId, { source_code: sourceCode });
        toast.success(t('editor.saved'));
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('editor.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const onValidate = async () => {
    const id = resolvedId;
    if (!id) {
      toast.error(t('editor.saveFirstToValidate'));
      return;
    }
    try {
      const res = await validateFunctionSource(id, sourceCode);
      if (res.valid) toast.success(t('editor.validateOk'));
      else toast.error(res.errors.join('; ') || t('editor.validateFailed'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('editor.validateFailed'));
    }
  };

  const onRun = async () => {
    const id = resolvedId;
    if (!id) return;
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(previewInput) as Record<string, unknown>;
    } catch {
      toast.error(t('editor.invalidJson'));
      return;
    }
    setRunning(true);
    try {
      const res = await executeOntologyFunction(id, input);
      setPreviewOutput(JSON.stringify(res, null, 2));
      if (res.status === 'ok') toast.success(t('editor.runOk'));
      else toast.error(res.error || t('functions.runFailed'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('functions.runFailed'));
    } finally {
      setRunning(false);
    }
  };

  const onDelete = async () => {
    const id = resolvedId;
    if (!id || !window.confirm(t('shared.delete'))) return;
    try {
      await deleteOntologyFunction(id);
      toast.success(t('editor.deleted'));
      navigate('/function-editor');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('functions.loadFailed'));
    }
  };

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
    </div>
  );
}
