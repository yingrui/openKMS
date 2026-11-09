import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { fetchMetrics, type MetricResponse } from '../../../data/metricsApi';
import { fetchDatasetJoins, type DatasetJoinResponse } from '../../../data/joinsApi';
import type { RequestError } from '../../../data/apiClient';
import {
  fetchModelFields,
  isTimeDimension,
  type SemanticModelFieldResponse,
} from '../../../data/semanticModelFieldsApi';
import {
  querySemanticModel,
  querySemanticModelSql,
  type SemanticModelQueryResponse,
  type SemanticModelQuerySpec,
} from '../../../data/semanticModelsApi';
import { useAsyncData } from '../../../hooks/useAsyncData';
import { fetchDataResources } from '../../../data/dataResourcesApi';
import { isRestrictedAccess } from '../../../data/semanticModelsApi';
import {
  canRunQuery,
  compactSpec,
  emptyAdvancedSpec,
  emptySpec,
  modeFromUrl,
  specFromUrl,
  toFilters,
  type FilterRow,
  type PlaygroundMode,
} from './modelPlaygroundSpec';
import type { RunError } from './ModelPlaygroundAnswer';
import { useSemanticModelDetail } from './useSemanticModelDetail';

export const GRANULARITIES = ['day', 'week', 'month', 'quarter', 'year'];
export const OPS = ['=', '!=', '>', '>=', '<', '<=', 'like', 'in', 'between', 'is_null', 'is_not_null'];
export const MODES: PlaygroundMode[] = ['builder', 'advanced', 'sql'];

/** `kind` is set by the query API (`definition` / `data` / `request`); anything else is generic. */
function runErrorFrom(error: unknown, fallback: string): RunError {
  const err = error as RequestError;
  const detail = err?.detail;
  const kind = typeof detail?.kind === 'string' ? detail.kind : '';
  return {
    kind,
    message: error instanceof Error && error.message ? error.message : fallback,
    detail: typeof detail?.detail === 'string' ? detail.detail : undefined,
  };
}

export function metricExpressionText(metric: MetricResponse): string {
  const dialect = metric.expression?.dialects?.find((d) => d.dialect === 'ANSI_SQL');
  return dialect?.expression ?? '';
}

/**
 * Playground state: catalog load, query spec (mirrored in the URL), run/copy.
 * Split out of `ModelPlaygroundSection` to keep the page TSX under the size limit.
 */
export function useModelPlayground() {
  const { t } = useTranslation('ontology');
  const { model, allDatasets } = useSemanticModelDetail();
  const modelId = model.id;
  const [params, setParams] = useSearchParams();

  const { data, loading, error } = useAsyncData(
    () =>
      Promise.all([fetchMetrics(modelId), fetchModelFields(modelId), fetchDatasetJoins()]).then(
        ([metricPage, fieldPage, joinPage]) => ({
          metrics: metricPage.items,
          fields: fieldPage.items,
          joins: joinPage.items,
        }),
      ),
    [modelId],
  );
  const restricted = isRestrictedAccess(model.access_mode);
  // A restricted model answers only inside a granted resource, so the scope is picked up front
  // and rides along on every run instead of being inferred at submit time.
  const { data: resourcePage } = useAsyncData(
    () =>
      restricted
        ? fetchDataResources(modelId, { grantedOnly: true })
        : Promise.resolve({ items: [], total: 0 }),
    [restricted, modelId],
  );
  const resources = useMemo(() => resourcePage?.items ?? [], [resourcePage]);
  const [resourceId, setResourceId] = useState<string>('');
  const activeResourceId = resourceId || resources[0]?.id || '';
  const activeResource = resources.find((r) => r.id === activeResourceId) ?? null;

  const metrics = useMemo(() => data?.metrics ?? [], [data]);
  const fields = useMemo(() => data?.fields ?? [], [data]);
  const allJoins = useMemo(() => data?.joins ?? [], [data]);

  const memberIds = useMemo(() => new Set(model.dataset_ids), [model.dataset_ids]);
  const modelDatasets = useMemo(
    () => allDatasets.filter((d) => memberIds.has(d.id) && d.kind === 'table'),
    [allDatasets, memberIds],
  );
  const modelJoins = useMemo(
    () =>
      allJoins.filter(
        (j) => memberIds.has(j.from_dataset_id) && memberIds.has(j.to_dataset_id),
      ),
    [allJoins, memberIds],
  );

  const [mode, setMode] = useState<PlaygroundMode>(() => modeFromUrl(params.get('mode')));
  const [spec, setSpec] = useState<SemanticModelQuerySpec | null>(null);
  const [filterRows, setFilterRows] = useState<FilterRow[]>([]);
  const [sqlText, setSqlText] = useState('');
  const [sqlLimit, setSqlLimit] = useState(100);
  const [result, setResult] = useState<SemanticModelQueryResponse | null>(null);
  const [runError, setRunError] = useState<RunError | null>(null);
  const [running, setRunning] = useState(false);

  // Adopt loaded catalog into the query spec once per model (a URL spec wins).
  const [adoptedFor, setAdoptedFor] = useState<string | null>(null);
  if (data && adoptedFor !== modelId) {
    setAdoptedFor(modelId);
    const fromUrl = specFromUrl(params.get('q'));
    const initialMode = modeFromUrl(params.get('mode'));
    const sqlFromUrl = (params.get('sql') || '').trim();
    setMode(initialMode);
    if (initialMode === 'sql' && sqlFromUrl) {
      setSqlText(sqlFromUrl);
    }
    if (fromUrl) {
      setSpec(fromUrl);
      setFilterRows(
        fromUrl.filters.map((f, i) => ({
          id: i,
          field: f.field,
          op: f.op,
          value: Array.isArray(f.value) ? String(f.value[0] ?? '') : String(f.value ?? ''),
          value2: Array.isArray(f.value) ? String(f.value[1] ?? '') : '',
        })),
      );
    } else if (initialMode === 'advanced') {
      setSpec(emptyAdvancedSpec(model.dataset_ids[0] ?? ''));
      setFilterRows([]);
    } else if (initialMode === 'sql') {
      setSpec(emptyAdvancedSpec(model.dataset_ids[0] ?? ''));
      setFilterRows([]);
    } else if (data.metrics[0]) {
      setSpec(emptySpec(data.metrics[0].id));
      setFilterRows([]);
    } else {
      setSpec(emptyAdvancedSpec(model.dataset_ids[0] ?? ''));
      setFilterRows([]);
    }
  }

  useEffect(() => {
    if (error) toast.error(error instanceof Error ? error.message : t('datasets.loadFailed'));
  }, [error, t]);

  const metric = useMemo(
    () => metrics.find((m) => m.id === spec?.metric) ?? null,
    [metrics, spec?.metric],
  );

  const metricJoinIds = useMemo(() => new Set(metric?.joins ?? []), [metric?.joins]);
  const usedJoins = useMemo(
    () => allJoins.filter((j) => metricJoinIds.has(j.id)),
    [allJoins, metricJoinIds],
  );

  const filtersApplied = useMemo(
    () =>
      (metric?.filters?.length ?? 0) > 0 ||
      filterRows.some((row) => row.field && row.op) ||
      Boolean(spec?.where?.trim()) ||
      Boolean(spec?.having?.trim()),
    [metric?.filters, filterRows, spec?.where, spec?.having],
  );

  const advancedBaseId = spec?.base_dataset ?? null;
  const scopeIds = useMemo(() => {
    if (mode === 'advanced' && advancedBaseId) {
      const joinIds = new Set(spec?.joins ?? []);
      const joined = modelJoins
        .filter((j) => joinIds.has(j.id))
        .map((j) =>
          j.from_dataset_id === advancedBaseId ? j.to_dataset_id : j.from_dataset_id,
        );
      return new Set([advancedBaseId, ...joined]);
    }
    if (!metric) return null;
    const joined = usedJoins.map((j) =>
      j.from_dataset_id === metric.base_dataset_id ? j.to_dataset_id : j.from_dataset_id,
    );
    return new Set([metric.base_dataset_id, ...joined]);
  }, [mode, advancedBaseId, spec?.joins, modelJoins, metric, usedJoins]);

  const groupable = useMemo(
    () =>
      fields
        .filter((f) => !scopeIds || scopeIds.has(f.dataset_id))
        .sort(
          (a, b) =>
            Number(b.dataset_id === (metric?.base_dataset_id ?? advancedBaseId)) -
            Number(a.dataset_id === (metric?.base_dataset_id ?? advancedBaseId)),
        ),
    [fields, metric?.base_dataset_id, advancedBaseId, scopeIds],
  );
  const timeDims = groupable.filter(isTimeDimension);
  const otherFields = groupable.filter((f) => !isTimeDimension(f));
  const timeFieldRefs = useMemo(
    () => new Set(fields.filter(isTimeDimension).flatMap((f) => [f.id, f.name])),
    [fields],
  );
  const grouped = useMemo(
    () => new Map((spec?.group_by ?? []).map((g) => [g.field, g])),
    [spec?.group_by],
  );
  const fieldLabel = (ref: string) => fields.find((f) => f.id === ref || f.name === ref)?.name ?? ref;
  const datasetLabel = (id: string) =>
    modelDatasets.find((d) => d.id === id)?.display_name ||
    model.datasets.find((d) => d.id === id)?.name ||
    id;

  const patch = (next: Partial<SemanticModelQuerySpec>) =>
    setSpec((prev) => (prev ? { ...prev, ...next } : prev));

  const toggleGroup = (field: SemanticModelFieldResponse) => {
    if (!spec) return;
    const on = grouped.has(field.id);
    patch({
      group_by: on
        ? spec.group_by.filter((g) => g.field !== field.id)
        : [...spec.group_by, { field: field.id, granularity: isTimeDimension(field) ? 'day' : null }],
    });
  };

  const setGrain = (fieldId: string, granularity: string) =>
    patch({
      group_by: spec!.group_by.map((g) => (g.field === fieldId ? { ...g, granularity } : g)),
    });

  const switchMode = (next: PlaygroundMode) => {
    setMode(next);
    setResult(null);
    setRunError(null);
    if (next === 'builder') {
      if (!spec?.metric && metrics[0]) {
        setSpec(emptySpec(metrics[0].id));
        setFilterRows([]);
      }
    } else if (next === 'advanced') {
      if (spec?.metric && !spec.expression) {
        const m = metrics.find((x) => x.id === spec.metric);
        setSpec({
          ...emptyAdvancedSpec(m?.base_dataset_id ?? model.dataset_ids[0] ?? ''),
          expression: m ? metricExpressionText(m) : '',
          joins: m?.joins ? [...m.joins] : [],
          group_by: spec.group_by,
          filters: spec.filters,
          order_by: spec.order_by,
          limit: spec.limit,
          where: spec.where ?? '',
          having: spec.having ?? '',
        });
      } else if (!spec || spec.metric) {
        setSpec(emptyAdvancedSpec(model.dataset_ids[0] ?? ''));
        setFilterRows([]);
      }
    }
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('mode', next);
        if (next !== 'sql') p.delete('sql');
        return p;
      },
      { replace: true },
    );
  };

  const handleRun = async () => {
    if (mode === 'sql') {
      if (!sqlText.trim()) {
        toast.error(t('dataModel.playgroundSqlEmpty'));
        return;
      }
      setRunning(true);
      try {
        setResult(
          await querySemanticModelSql(modelId, {
            sql: sqlText,
            limit: sqlLimit,
            resource_id: activeResourceId || null,
          }),
        );
        setRunError(null);
        setParams(
          (prev) => {
            const p = new URLSearchParams(prev);
            p.set('mode', 'sql');
            p.delete('q');
            if (sqlText.trim()) p.set('sql', sqlText);
            else p.delete('sql');
            return p;
          },
          { replace: true },
        );
      } catch (e) {
        setResult(null);
        setRunError(runErrorFrom(e, t('dataModel.playgroundRunFailed')));
      } finally {
        setRunning(false);
      }
      return;
    }

    if (!spec || !canRunQuery(spec)) {
      toast.error(t('dataModel.playgroundNeedMetricOrExpression'));
      return;
    }
    setRunning(true);
    const runSpec = compactSpec({ ...spec, filters: toFilters(filterRows) });
    try {
      setResult(
        await querySemanticModel(modelId, { ...runSpec, resource_id: activeResourceId || null }),
      );
      setRunError(null);
      setParams({ mode, q: JSON.stringify(runSpec) }, { replace: true });
    } catch (e) {
      setResult(null);
      setRunError(runErrorFrom(e, t('dataModel.playgroundRunFailed')));
    } finally {
      setRunning(false);
    }
  };

  const copyQuery = async () => {
    try {
      const text =
        mode === 'sql'
          ? sqlText
          : spec
            ? JSON.stringify(compactSpec({ ...spec, filters: toFilters(filterRows) }), null, 2)
            : '';
      if (!text.trim()) return;
      await navigator.clipboard.writeText(text);
      toast.success(t('dataModel.playgroundCopied'));
    } catch {
      toast.error(t('dataModel.playgroundCopyFailed'));
    }
  };

  const toggleJoin = (join: DatasetJoinResponse) => {
    const current = new Set(spec?.joins ?? []);
    if (current.has(join.id)) current.delete(join.id);
    else current.add(join.id);
    patch({ joins: [...current] });
  };

  const runDisabled =
    running ||
    (restricted && !activeResourceId) ||
    (mode === 'sql' ? !sqlText.trim() : !spec || !canRunQuery(spec));

  return {
    t,
    model,
    modelId,
    metrics,
    fields,
    modelDatasets,
    modelJoins,
    loading,
    restricted,
    resources,
    activeResourceId,
    activeResource,
    setResourceId,
    mode,    spec,
    patch,
    filterRows,
    setFilterRows,
    setSpec,
    sqlText,
    setSqlText,
    sqlLimit,
    setSqlLimit,
    result,
    runError,
    running,
    metric,
    usedJoins,
    filtersApplied,
    groupable,
    timeDims,
    otherFields,
    timeFieldRefs,
    grouped,
    fieldLabel,
    datasetLabel,
    advancedBaseId,
    switchMode,
    toggleGroup,
    setGrain,
    toggleJoin,
    handleRun,
    copyQuery,
    runDisabled,
  };
}

export type ModelPlaygroundState = ReturnType<typeof useModelPlayground>;
