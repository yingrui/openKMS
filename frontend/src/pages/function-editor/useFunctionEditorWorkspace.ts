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
  publishOntologyFunction,
  dryRunLogicFlow,
  saveFunctionVersion,
  updateOntologyFunction,
  validateFunctionSource,
} from '../../data/ontologyFunctionsApi';
import { fetchObjectTypes, type ObjectTypeResponse } from '../../data/ontologyApi';
import { AUTHORING_OF_SOURCE, backToListPath, hasUnpublishedDraft, type Authoring } from './functionEditorState';
import {
  draftFromSpec,
  emptyDraft,
  inputNames,
  inputSchemaFromDraft,
  specFromDraft,
  type FlowDraft,
} from './logicFlow';
import { fetchAllModels } from '../../data/modelsApi';
import { useConfirm } from '../../contexts/ConfirmContext';

export function useFunctionEditorWorkspace() {
  const { t } = useTranslation('ontology');
  const confirm = useConfirm();
  const { functionId } = useParams<{ functionId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const isNew = location.pathname.endsWith('/new');
  // The list you came from decides the authoring mode when creating: `?kind=logic` opens the flow editor.
  const preset: Authoring =
    new URLSearchParams(location.search).get('kind') === 'logic' ? 'logic' : 'code';

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
  // Which list "back" returns to is a property of the function, not of the page.
  const [authoring, setAuthoring] = useState<Authoring>(preset);
  const [flow, setFlow] = useState<FlowDraft>(emptyDraft());
  const [flowErrors, setFlowErrors] = useState<string[]>([]);
  const [models, setModels] = useState<{ id: string; label: string; isDefault: boolean }[]>([]);
  const [trace, setTrace] = useState<Record<string, unknown> | null>(null);
  const [runValues, setRunValues] = useState<Record<string, string>>({});
  const [latestVersion, setLatestVersion] = useState<number | null>(null);
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null);
  const [publishing, setPublishing] = useState(false);

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

  // Only needed when the flow editor is on screen; a failed list leaves the "default model" option usable.
  useEffect(() => {
    if (authoring !== 'logic') return;
    void fetchAllModels({ api_kind: 'chat-completions' })
      .then((rows) =>
        setModels(
          rows.map((model) => ({
            id: model.id,
            label: model.name,
            isDefault: model.is_default_in_category,
          })),
        ),
      )
      .catch(() => setModels([]));
  }, [authoring]);

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
      setAuthoring(AUTHORING_OF_SOURCE(fn.source));
      setLatestVersion(fn.latest_version ?? null);
      setPublishedVersion(fn.published_version ?? null);
      const versions = await fetchFunctionVersions(functionId);
      if (versions[0]) {
        setSourceCode(versions[0].source_code);
        setInputSchemaText(
          versions[0].input_schema ? JSON.stringify(versions[0].input_schema, null, 2) : '',
        );
        setOutputSchemaText(
          versions[0].output_schema ? JSON.stringify(versions[0].output_schema, null, 2) : '',
        );
        setFlow(draftFromSpec(versions[0].flow_spec));
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
      let flowSpec: Record<string, unknown> | null = null;
      if (authoring === 'logic') {
        const draft = specFromDraft(flow);
        setFlowErrors(draft.errors);
        if (draft.errors.length) {
          toast.error(t('editor.logicFixErrors'));
          return;
        }
        flowSpec = draft.spec;
        // The inputs are whatever the prompts mention; keeping a stale hand-written schema would make Run reject them.
        inputSchema = inputSchemaFromDraft(flow);
      }
      if (isNew) {
        const fn = await createOntologyFunction({
          api_name: apiName,
          display_name: displayName || apiName,
          object_type_id: objectTypeId || null,
          source: authoring,
          source_code: authoring === 'logic' ? '' : sourceCode,
          input_schema: inputSchema,
          output_schema: outputSchema,
          flow_spec: flowSpec,
        });
        toast.success(t('editor.created'));
        navigate(`/function-editor/${fn.id}`, { replace: true });
        setResolvedId(fn.id);
      } else if (resolvedId) {
        const version = await saveFunctionVersion(resolvedId, {
          source_code: authoring === 'logic' ? '' : sourceCode,
          input_schema: inputSchema,
          output_schema: outputSchema,
          flow_spec: flowSpec,
        });
        setLatestVersion(version?.version ?? latestVersion);
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
    if (authoring === 'logic') {
      const draft = specFromDraft(flow);
      setFlowErrors(draft.errors);
      if (draft.errors.length || !draft.spec) {
        toast.error(t('editor.logicFixErrors'));
        return;
      }
      setRunning(true);
      setTrace(null);
      try {
        const payload: Record<string, unknown> = {};
        for (const field of flow.inputs) {
          const raw = runValues[field.name] ?? '';
          if (field.type === 'object') {
            try {
              payload[field.name] = raw.trim() ? JSON.parse(raw) : {};
            } catch {
              toast.error(t('editor.logicObjectInputJson', { name: field.name }));
              setRunning(false);
              return;
            }
          } else {
            payload[field.name] = raw;
          }
        }
        const res = await dryRunLogicFlow(id, {
          flow_spec: draft.spec as Record<string, unknown>,
          input: payload,
        });
        setPreviewOutput(JSON.stringify(res.output ?? res.error ?? res, null, 2));
        setTrace(res.trace ?? null);
        if (res.status === 'ok') toast.success(t('editor.runOk'));
        else toast.error(res.error || t('functions.runFailed'));
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t('functions.runFailed'));
      } finally {
        setRunning(false);
      }
      return;
    }
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
      setPreviewOutput(JSON.stringify(res.output ?? res, null, 2));
      setTrace(res.trace ?? null);
      if (res.status === 'ok') toast.success(t('editor.runOk'));
      else toast.error(res.error || t('functions.runFailed'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('functions.runFailed'));
    } finally {
      setRunning(false);
    }
  };

  const onPublish = async () => {
    const id = resolvedId;
    if (!id) return;
    setPublishing(true);
    try {
      const updated = await publishOntologyFunction(id);
      setLatestVersion(updated.latest_version ?? latestVersion);
      setPublishedVersion(updated.published_version ?? null);
      toast.success(t('functions.published'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('functions.publishFailed'));
    } finally {
      setPublishing(false);
    }
  };

  const onDelete = async () => {
    const id = resolvedId;
    if (!id) return;
    if (
      !(await confirm({
        title: t('editor.deleteTitle', { name: displayName || apiName }),
        message: t('editor.deleteConfirm'),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    try {
      await deleteOntologyFunction(id);
    } catch (e: unknown) {
      // A published Function is callable, so the API refuses to delete it outright. Say what has
      // to happen and do it, instead of leaving the reader with a toast and no control for it.
      const message = e instanceof Error ? e.message : '';
      if (!/archive|unpublish/i.test(message)) {
        toast.error(message || t('editor.deleteFailed'));
        return;
      }
      if (
        !(await confirm({
          title: t('editor.archiveAndDeleteTitle'),
          message: t('editor.archiveAndDeleteMessage'),
          confirmLabel: t('editor.archiveAndDelete'),
          danger: true,
        }))
      )
        return;
      try {
        await updateOntologyFunction(id, { status: 'archived' });
        await deleteOntologyFunction(id);
      } catch (inner: unknown) {
        toast.error(inner instanceof Error ? inner.message : t('editor.deleteFailed'));
        return;
      }
    }
    toast.success(t('editor.deleted'));
    navigate('/function-editor');
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
    onPublish,
    publishing,
    backTo: backToListPath(authoring),
    isLogic: authoring === 'logic',
    flow,
    setFlow,
    flowErrors,
    models,
    trace,
    runInputs: inputNames(flow),
    runValues,
    setRunValues,
    canPublish: Boolean(resolvedId) && !publishing && hasUnpublishedDraft(latestVersion, publishedVersion),
    onRun,
    onDelete,
  };
}
