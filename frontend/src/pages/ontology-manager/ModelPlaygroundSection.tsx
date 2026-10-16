import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Copy, Loader2, Play, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchMetrics, type MetricResponse } from '../../data/metricsApi';
import { fetchDatasetJoins, type DatasetJoinResponse } from '../../data/joinsApi';
import type { RequestError } from '../../data/apiClient';
import {
  fetchModelFields,
  isTimeDimension,
  type SemanticModelFieldResponse,
} from '../../data/semanticModelFieldsApi';
import {
  querySemanticModel,
  type SemanticModelQueryResponse,
  type SemanticModelQuerySpec,
} from '../../data/semanticModelsApi';
import { FormField } from '../../styles/design-system';
import { useAsyncData } from '../../hooks/useAsyncData';
import { EntityViewHeader, EntityViewPanel } from './EntityViewShell';
import {
  emptySpec,
  specFromUrl,
  toFilters,
  type FilterRow,
} from './modelPlaygroundSpec';
import { ModelPlaygroundAnswer, type RunError } from './ModelPlaygroundAnswer';
import { modelReportDraft } from './reportDraft';
import { ChipPicker } from '../../components/ontology/ChipPicker';
import { FilterRows } from '../../components/ontology/FilterRows';
import { useSemanticModelDetail } from './useSemanticModelDetail';

const GRANULARITIES = ['day', 'week', 'month', 'quarter', 'year'];
const OPS = ['=', '!=', '>', '>=', '<', '<=', 'like', 'in', 'between', 'is_null', 'is_not_null'];
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

/**
 * Model → Playground: express a question and read the answer — the metric over fields, with
 * filters, an order and a limit. Read-only and capped; the definition is one click away.
 */
export function ModelPlaygroundSection() {
  const { t } = useTranslation('ontology');
  const { model } = useSemanticModelDetail();
  const modelId = model.id;
  const [params, setParams] = useSearchParams();

  const { data, loading, error } = useAsyncData(
    () =>
      Promise.all([fetchMetrics(modelId), fetchModelFields(modelId)]).then(
        ([metricPage, fieldPage]) => ({ metrics: metricPage.items, fields: fieldPage.items }),
      ),
    [modelId],
  );
  const metrics = useMemo(() => data?.metrics ?? [], [data]);
  const fields = useMemo(() => data?.fields ?? [], [data]);

  /** Fields the model declares as time dimensions — the only ones a date input makes sense for. */
  const timeFieldRefs = useMemo(
    () => new Set(fields.filter(isTimeDimension).flatMap((f) => [f.id, f.name])),
    [fields],
  );

  const [spec, setSpec] = useState<SemanticModelQuerySpec | null>(null);
  const [filterRows, setFilterRows] = useState<FilterRow[]>([]);
  const [result, setResult] = useState<SemanticModelQueryResponse | null>(null);
  const [runError, setRunError] = useState<RunError | null>(null);
  const [running, setRunning] = useState(false);

  // Adopt the loaded metric catalog into the query spec once per model (a URL spec wins).
  const [adoptedFor, setAdoptedFor] = useState<string | null>(null);
  if (data && adoptedFor !== modelId) {
    setAdoptedFor(modelId);
    const initial = specFromUrl(params.get('q')) ?? emptySpec(data.metrics[0]?.id ?? '');
    setSpec(initial);
    setFilterRows(
      initial.filters.map((f, i) => ({
        id: i,
        field: f.field,
        op: f.op,
        value: Array.isArray(f.value) ? String(f.value[0] ?? '') : String(f.value ?? ''),
        value2: Array.isArray(f.value) ? String(f.value[1] ?? '') : '',
      })),
    );
  }

  useEffect(() => {
    if (error) toast.error(error instanceof Error ? error.message : t('datasets.loadFailed'));
  }, [error, t]);

  const metric = useMemo(
    () => metrics.find((m) => m.id === spec?.metric) ?? null,
    [metrics, spec?.metric],
  );

  /** The relationships this metric's expression needs — named, so the author can check them. */
  const metricJoinIds = useMemo(() => new Set(metric?.joins ?? []), [metric?.joins]);
  const { data: usedJoins } = useAsyncData(
    () =>
      metricJoinIds.size
        ? fetchDatasetJoins().then((page) => page.items.filter((j) => metricJoinIds.has(j.id)))
        : Promise.resolve([] as DatasetJoinResponse[]),
    [metricJoinIds],
  );

  /** Whether anything narrows the answer — it decides what "no rows" means. */
  const filtersApplied = useMemo(
    () => (metric?.filters?.length ?? 0) > 0 || filterRows.some((row) => row.field && row.op),
    [metric?.filters, filterRows],
  );

  /**
   * The metric's field scope: its own dataset, plus the datasets it joins (a joined field can be
   * grouped or filtered exactly like the base's — the engine resolves them the same way).
   */
  const scopeIds = useMemo(() => {
    if (!metric) return null;
    const joined = (usedJoins ?? []).map((j) =>
      j.from_dataset_id === metric.base_dataset_id ? j.to_dataset_id : j.from_dataset_id,
    );
    return new Set([metric.base_dataset_id, ...joined]);
  }, [metric, usedJoins]);
  const groupable = useMemo(
    () =>
      fields
        .filter((f) => !scopeIds || scopeIds.has(f.dataset_id))
        // The base dataset first: a name that exists on both sides means its field.
        .sort((a, b) => Number(b.dataset_id === metric?.base_dataset_id) - Number(a.dataset_id === metric?.base_dataset_id)),
    [fields, metric?.base_dataset_id, scopeIds],
  );
  const timeDims = groupable.filter(isTimeDimension);
  const otherFields = groupable.filter((f) => !isTimeDimension(f));
  const grouped = useMemo(
    () => new Map((spec?.group_by ?? []).map((g) => [g.field, g])),
    [spec?.group_by],
  );
  const fieldLabel = (ref: string) => fields.find((f) => f.id === ref || f.name === ref)?.name ?? ref;
  const datasetLabel = (id: string) => model.datasets.find((d) => d.id === id)?.name ?? id;
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

  const handleRun = async () => {
    if (!spec?.metric) return;
    setRunning(true);
    const runSpec: SemanticModelQuerySpec = { ...spec, filters: toFilters(filterRows) };
    try {
      setResult(await querySemanticModel(modelId, runSpec));
      setRunError(null);
      setParams({ q: JSON.stringify(runSpec) }, { replace: true });
    } catch (e) {
      // The answer pane explains the failure; a toast would say the same thing twice.
      setResult(null);
      setRunError(runErrorFrom(e, t('dataModel.playgroundRunFailed')));
    } finally {
      setRunning(false);
    }
  };

  /** The same spec object the skill/agent send — copied verbatim. */

  const copyQuery = async () => {
    if (!spec) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ ...spec, filters: toFilters(filterRows) }, null, 2),
      );
      toast.success(t('dataModel.playgroundCopied'));
    } catch {
      toast.error(t('dataModel.playgroundCopyFailed'));
    }
  };

  if (loading) {
    return (
      <>
        <EntityViewHeader title={t('dataModel.playgroundTitle')} subtitle={t('dataModel.playgroundHint')} />
        <EntityViewPanel>
          <p className="entity-view__readonly">{t('shared.loading')}</p>
        </EntityViewPanel>
      </>
    );
  }

  if (metrics.length === 0 || !spec) {
    return (
      <>
        <EntityViewHeader title={t('dataModel.playgroundTitle')} subtitle={t('dataModel.playgroundHint')} />
        <EntityViewPanel>
          <p className="entity-view__readonly">{t('dataModel.playgroundNoMetrics')}</p>
        </EntityViewPanel>
      </>
    );
  }

  return (
    <>
      <EntityViewHeader
        title={t('dataModel.playgroundTitle')}
        subtitle={t('dataModel.playgroundHint')}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => void copyQuery()}>
              <Copy size={16} aria-hidden />
              {t('dataModel.playgroundCopyQuery')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleRun()}
              disabled={running}
            >
              {running ? (
                <Loader2 size={16} className="console-loading-spinner" aria-hidden />
              ) : (
                <Play size={16} aria-hidden />
              )}
              {t('dataModel.playgroundRun')}
            </button>
          </>
        }
      />

      <div className="playground">
        {/* ---------- the question ---------- */}
        <div className="playground__query">
          <EntityViewPanel>
            <div className="entity-view__form playground__form">
              <FormField label={t('datasets.metricName')}>
                <select
                  value={spec.metric}
                  onChange={(e) => {
                    setSpec({ ...emptySpec(e.target.value) });
                    setFilterRows([]);
                  }}
                >
                  {metrics.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </FormField>

              <div className="playground__section">
                <span className="playground__label">
                  {t('dataModel.playgroundDimensions')}
                  {spec.group_by.length > 0 ? (
                    <span className="playground__group-count">
                      {t('dataModel.playgroundSelectedCount', { count: spec.group_by.length })}
                    </span>
                  ) : null}
                </span>

                {spec.group_by.length > 0 && (
                  <div className="chip-row">
                    {spec.group_by.map((g) => {
                      const f = fields.find((x) => x.id === g.field || x.name === g.field);
                      return (
                        <span key={g.field} className="chip">
                          {fieldLabel(g.field)}
                          {f && isTimeDimension(f) ? (
                            // ds-control-exempt: `.chip select` styles this
                            <select
                              value={g.granularity ?? 'day'}
                              aria-label={t('dataModel.fieldGranularity')}
                              onChange={(e) => setGrain(g.field, e.target.value)}
                            >
                              {GRANULARITIES.map((gr) => (
                                <option key={gr} value={gr}>
                                  {gr}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          <button
                            type="button"
                            className="chip__remove"
                            aria-label={t('dataModel.playgroundRemoveDimension', { name: fieldLabel(g.field) })}
                            onClick={() => toggleGroup(f!)}
                          >
                            <X size={12} aria-hidden />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                <ChipPicker
                  idPrefix="playground-field"
                  options={[
                    ...timeDims.map((f) => ({
                      id: f.id,
                      label: f.name,
                      hint: f.datatype ?? '',
                      group: t('dataModel.playgroundTimeDimensions'),
                    })),
                    ...otherFields.map((f) => ({
                      id: f.id,
                      label: f.name,
                      hint: f.datatype ?? '',
                      group: t('dataModel.playgroundOtherFields', { count: otherFields.length }),
                    })),
                  ]}
                  groups={[
                    t('dataModel.playgroundTimeDimensions'),
                    t('dataModel.playgroundOtherFields', { count: otherFields.length }),
                  ]}
                  isPicked={(id) => spec.group_by.some((g) => g.field === id)}
                  onPick={(id) => {
                    const field = fields.find((f) => f.id === id);
                    if (field) toggleGroup(field);
                  }}
                  onBackspaceEmpty={() => {
                    const last = spec.group_by[spec.group_by.length - 1];
                    const field = fields.find((f) => f.id === last?.field || f.name === last?.field);
                    if (field) toggleGroup(field);
                  }}
                  ariaLabel={t('dataModel.playgroundDimensions')}
                  placeholder={t('dataModel.playgroundFieldPickerPlaceholder')}
                  title={t('dataModel.playgroundFieldPickerTitle')}
                  emptyLabel={t('dataModel.noSearchMatch')}
                />
              </div>

              <div className="playground__section">
                <span className="playground__label">{t('dataModel.playgroundFilters')}</span>
                {metric && (metric.filters?.length ?? 0) > 0 && (
                  <p className="page-subtitle">
                    {t('dataModel.playgroundMetricFilters')}:{' '}
                    {metric.filters
                      ?.map((f) => `${f.column} ${f.op} ${String(f.value ?? '')}`.trim())
                      .join(' · ')}
                  </p>
                )}
                <FilterRows
                  /* The shared rows speak the dataset vocabulary (`column`); a model query's rows
                     carry `field`, which is also what the API receives. Convert at the boundary. */
                  rows={filterRows.map((row) => ({
                    id: row.id,
                    column: row.field,
                    op: row.op,
                    value: row.value,
                    value2: row.value2,
                  }))}
                  onChange={(rows) =>
                    setFilterRows(
                      rows.map((row) => ({
                        id: row.id,
                        field: row.column,
                        op: row.op,
                        value: row.value,
                        value2: row.value2,
                      })),
                    )
                  }
                  columns={groupable.map((f) => ({
                    id: f.id,
                    label:
                      metric && f.dataset_id !== metric.base_dataset_id
                        ? `${f.name} · ${datasetLabel(f.dataset_id)}`
                        : f.name,
                  }))}
                  timeRefs={timeFieldRefs}
                  ops={OPS}
                />
              </div>

              <div className="playground__section playground__section--row">
                <div className="playground__field-group">
                  <span className="playground__label">{t('dataModel.playgroundOrder')}</span>
                  <div className="playground__controls">
                    <select
                      className="ds-control"
                      value={spec.order_by[0]?.field ?? ''}
                      aria-label={t('dataModel.playgroundOrder')}
                      onChange={(e) =>
                        patch({
                          order_by: e.target.value
                            ? [
                                {
                                  field: e.target.value,
                                  direction: spec.order_by[0]?.direction ?? 'desc',
                                },
                              ]
                            : [],
                        })
                      }
                    >
                      <option value="">{t('dataModel.playgroundOrderNone')}</option>
                      <option value="value">{t('dataModel.playgroundOrderValue')}</option>
                      {spec.group_by.map((g) => (
                        <option key={g.field} value={fieldLabel(g.field)}>
                          {fieldLabel(g.field)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="ds-control playground__direction"
                      value={spec.order_by[0]?.direction ?? 'desc'}
                      aria-label={t('dataModel.playgroundDirection')}
                      disabled={spec.order_by.length === 0}
                      onChange={(e) =>
                        patch({
                          order_by: [
                            {
                              field: spec.order_by[0]?.field ?? 'value',
                              direction: e.target.value as 'asc' | 'desc',
                            },
                          ],
                        })
                      }
                    >
                      <option value="desc">↓ desc</option>
                      <option value="asc">↑ asc</option>
                    </select>
                  </div>
                </div>
                <div className="playground__field-group playground__field-group--limit">
                  <label className="playground__label" htmlFor="pg-limit">
                    {t('dataModel.playgroundLimit')}
                  </label>
                  <input
                    id="pg-limit"
                    className="ds-control"
                    type="number"
                    min={1}
                    max={1000}
                    value={spec.limit}
                    onChange={(e) => patch({ limit: Number(e.target.value) || 1 })}
                  />
                </div>
              </div>
            </div>
          </EntityViewPanel>

          {metric && (
            <EntityViewPanel title={t('dataModel.playgroundDefinition')} defaultCollapsed>
              <dl className="entity-view__dl">
                  <dt>{t('dataModel.playgroundExpression')}</dt>
                  <dd>
                    <code>{metricExpressionText(metric)}</code>
                  </dd>
                  <dt>{t('dataModel.playgroundBaseDataset')}</dt>
                  <dd>{metric.base_dataset_name ?? metric.base_dataset_id}</dd>
                  <dt>{t('datasets.metricType')}</dt>
                  <dd>{metric.type}</dd>
                  <dt>{t('dataModel.playgroundJoins')}</dt>
                  <dd>
                    {usedJoins?.length
                      ? usedJoins.map((j) => (
                          <span key={j.id} className="playground__join">
                            {j.from_dataset_name ?? j.from_dataset_id} →{' '}
                            {j.to_dataset_name ?? j.to_dataset_id}
                          </span>
                        ))
                      : t('datasets.dash')}
                  </dd>
                  <dt>{t('dataModel.fieldDescription')}</dt>
                  <dd>{metric.business_definition || t('datasets.dash')}</dd>
                  <dt>{t('datasets.aiContext')}</dt>
                  <dd>
                    {String(
                      (metric.ai_context?.instructions as string) ??
                        (metric.ai_context?.synonyms as string[])?.join(', ') ??
                        '',
                    ) || t('datasets.dash')}
                  </dd>
              </dl>
            </EntityViewPanel>
          )}
        </div>

        <ModelPlaygroundAnswer
          result={result}
          runError={runError}
          filtersApplied={filtersApplied}
          saveDraft={modelReportDraft({
            modelId,
            modelName: model.name,
            metricName: metrics.find((m) => m.id === spec?.metric)?.name,
            spec,
            result,
          })}
        />
      </div>
    </>
  );
}
function metricExpressionText(metric: MetricResponse): string {
  const dialect = metric.expression?.dialects?.find((d) => d.dialect === 'ANSI_SQL');
  return dialect?.expression ?? '';
}
