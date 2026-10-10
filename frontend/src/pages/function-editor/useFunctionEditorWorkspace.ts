import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  DEFAULT_FUNCTION_TEMPLATE,
  DEFAULT_PREVIEW_INPUT,
  createOntologyFunction,
  deleteOntologyFunction,
  executeOntologyFunction,
  fetchFunctionVersions,
  fetchOntologyFunction,
  saveFunctionVersion,
  validateFunctionSource,
} from '../../data/ontologyFunctionsApi';
import { fetchObjectTypes, type ObjectTypeResponse } from '../../data/ontologyApi';
import { useConfirm } from '../../contexts/ConfirmContext';

export function useFunctionEditorWorkspace() {
  const { t } = useTranslation('ontology');
  const confirm = useConfirm();
  const { functionId } = useParams<{ functionId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const isNew = location.pathname.endsWith('/new');

  const [apiName, setApiName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [objectTypeId, setObjectTypeId] = useState('');
  const [objectTypes, setObjectTypes] = useState<ObjectTypeResponse[]>([]);
  const [sourceCode, setSourceCode] = useState(DEFAULT_FUNCTION_TEMPLATE);
  const [inputSchemaText, setInputSchemaText] = useState('');
  const [outputSchemaText, setOutputSchemaText] = useState('');
  const [previewInput, setPreviewInput] = useState(DEFAULT_PREVIEW_INPUT);
  const [previewOutput, setPreviewOutput] = useState('');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [resolvedId, setResolvedId] = useState<string | null>(isNew ? null : functionId ?? null);

  const parseOptionalSchema = (text: string, label: string): Record<string, unknown> | null | undefined => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed === null) return null;
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`${label} must be a JSON object`);
      }
      return parsed as Record<string, unknown>;
    } catch (e: unknown) {
      throw new Error(e instanceof Error ? e.message : `${label} must be valid JSON`);
    }
  };

  const insertSnippet = useCallback((snippet: string) => {
    setSourceCode((prev) => (prev.endsWith('\n') ? `${prev}${snippet}` : `${prev}\n${snippet}`));
  }, []);

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
      setObjectTypeId(fn.object_type_id ?? '');
      const versions = await fetchFunctionVersions(functionId);
      if (versions[0]) {
        setSourceCode(versions[0].source_code);
        setInputSchemaText(
          versions[0].input_schema ? JSON.stringify(versions[0].input_schema, null, 2) : '',
        );
        setOutputSchemaText(
          versions[0].output_schema ? JSON.stringify(versions[0].output_schema, null, 2) : '',
        );
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('functions.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [functionId, isNew, t]);

  useEffect(() => {
    void fetchObjectTypes()
      .then((res) => setObjectTypes(res.items))
      .catch(() => {
        /* optional for create form */
      });
  }, []);

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
      let inputSchema: Record<string, unknown> | null;
      let outputSchema: Record<string, unknown> | null;
      try {
        inputSchema = parseOptionalSchema(inputSchemaText, t('editor.inputSchema')) ?? null;
        outputSchema = parseOptionalSchema(outputSchemaText, t('editor.outputSchema')) ?? null;
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t('editor.invalidJson'));
        return;
      }
      if (isNew) {
        const fn = await createOntologyFunction({
          api_name: apiName,
          display_name: displayName || apiName,
          object_type_id: objectTypeId || null,
          source_code: sourceCode,
          input_schema: inputSchema,
          output_schema: outputSchema,
        });
        toast.success(t('editor.created'));
        navigate(`/function-editor/${fn.id}`, { replace: true });
        setResolvedId(fn.id);
      } else if (resolvedId) {
        await saveFunctionVersion(resolvedId, {
          source_code: sourceCode,
          input_schema: inputSchema,
          output_schema: outputSchema,
        });
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
    if (!id) return;
    if (
      !(await confirm({
        title: t('shared.delete'),
        message: t('shared.delete'),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    try {
      await deleteOntologyFunction(id);
      toast.success(t('editor.deleted'));
      navigate('/function-editor');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('editor.deleteFailed'));
    }
  };

  return {
    t,
    isNew,
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
  };
}
