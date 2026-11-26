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
  fetchFunctionExecutions,
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
  // Object inputs are filled by picking an instance, not by typing JSON.
  const [recentRuns, setRecentRuns] = useState<
    {
      id: string;
      created_at: string;
      duration_ms: number | null;
      status: string;
      tokens: number | null;
      /** A preview, not the function's production behaviour. */
      draft: boolean;
    }[]
  >([]);
  const [pickedInstances, setPickedInstances] = useState<
    Record<string, { id: string; data: Record<string, unknown> } | null>
  >({});
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

  /** The last few runs, so a refresh does not erase the only run you had. Loaded lazily in Logic mode. */
  const loadRecentRuns = useCallback(async () => {
    const id = resolvedId;
    if (!id || authoring !== 'logic') return;
    try {
      const rows = await fetchFunctionExecutions(id, { limit: 5 });
      setRecentRuns(
        rows.map((row) => {
          const nodes = Array.isArray((row.trace as { nodes?: unknown })?.nodes)
            ? ((row.trace as { nodes: { usage?: { total_tokens?: number } }[] }).nodes ?? [])
            : [];
          const tokens = nodes.reduce((sum, node) => sum + (node.usage?.total_tokens ?? 0), 0);
          return {
            id: row.id,
            created_at: row.created_at,
            duration_ms: row.duration_ms ?? null,
            status: row.status,
            tokens: tokens || null,
            draft: (row.trace as { draft?: boolean } | null)?.draft === true,
          };
        }),
      );
    } catch {
      setRecentRuns([]);
    }
  }, [resolvedId, authoring]);

  useEffect(() => {
    void loadRecentRuns();
  }, [loadRecentRuns]);

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
            const picked = pickedInstances[field.name];
            if (!picked) {
              toast.error(t('editor.logicObjectInputPick', { name: field.name }));
              setRunning(false);
              return;
            }
            payload[field.name] = picked.data;
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
        void loadRecentRuns();
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

  /** Show a past run in the same panels: output, trace, and its inputs if they are simple values. */
  const onSelectRun = (runId: string) => {
    void (async () => {
      try {
        const rows = await fetchFunctionExecutions(resolvedId ?? '', { limit: 50 });
        const row = rows.find((candidate) => candidate.id === runId);
        if (!row) return;
        setPreviewOutput(JSON.stringify(row.output_payload ?? row.error_message ?? {}, null, 2));
        setTrace((row.trace as Record<string, unknown>) ?? null);
        const values: Record<string, string> = {};
        const picked: Record<string, { id: string; data: Record<string, unknown> } | null> = {};
        for (const [key, value] of Object.entries(row.input_payload ?? {})) {
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            // An object input was filled by picking an instance; without restoring it, pressing Run again would
            // answer "pick an instance" and the replay would look broken.
            picked[key] = { id: '', data: value as Record<string, unknown> };
            values[key] = JSON.stringify(value);
          } else {
            values[key] = typeof value === 'string' ? value : JSON.stringify(value);
          }
        }
        setRunValues(values);
        setPickedInstances(picked);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t('functions.loadFailed'));
      }
    })();
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
    runValues,
    setRunValues,
    pickedInstances,
    setPickedInstances,
    recentRuns,
    onSelectRun,
    canPublish: Boolean(resolvedId) && !publishing && hasUnpublishedDraft(latestVersion, publishedVersion),
    onRun,
    onDelete,
  };
}
