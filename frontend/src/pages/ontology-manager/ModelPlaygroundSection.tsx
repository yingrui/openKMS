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
  querySemanticModelSql,
  type SemanticModelQueryResponse,
  type SemanticModelQuerySpec,
} from '../../data/semanticModelsApi';
import { FormField } from '../../styles/design-system';
import { useAsyncData } from '../../hooks/useAsyncData';
import { EntityViewHeader, EntityViewPanel } from './EntityViewShell';
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
import { ModelPlaygroundAnswer, type RunError } from './ModelPlaygroundAnswer';
import { modelFindingDraft } from './findingDraft';
import { ChipPicker } from '../../components/ontology/ChipPicker';
import { FilterRows } from '../../components/ontology/FilterRows';
import { useSemanticModelDetail } from './useSemanticModelDetail';

const GRANULARITIES = ['day', 'week', 'month', 'quarter', 'year'];
const OPS = ['=', '!=', '>', '>=', '<', '<=', 'like', 'in', 'between', 'is_null', 'is_not_null'];
const MODES: PlaygroundMode[] = ['builder', 'advanced', 'sql'];

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

function metricExpressionText(metric: MetricResponse): string {
  const dialect = metric.expression?.dialects?.find((d) => d.dialect === 'ANSI_SQL');
  return dialect?.expression ?? '';
}

/**
 * Model → Playground: Builder (metric UI), Advanced (expression/where/having), or SQL Lab.
 * Read-only and capped; the definition is one click away in Builder.
 */
export function ModelPlaygroundSection() {
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
    setMode(initialMode);
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
        setResult(await querySemanticModelSql(modelId, { sql: sqlText, limit: sqlLimit }));
        setRunError(null);
        setParams(
          (prev) => {
            const p = new URLSearchParams(prev);
            p.set('mode', 'sql');
            p.delete('q');
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
      setResult(await querySemanticModel(modelId, runSpec));
      setRunError(null);
      setParams(
        { mode, q: JSON.stringify(runSpec) },
        { replace: true },
      );
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

  if (mode === 'builder' && metrics.length === 0) {
    return (
      <>
        <EntityViewHeader title={t('dataModel.playgroundTitle')} subtitle={t('dataModel.playgroundHint')} />
        <EntityViewPanel>
          <div className="playground__modes" role="tablist" aria-label={t('dataModel.playgroundModes')}>
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className={`playground__mode${mode === m ? ' is-active' : ''}`}
                onClick={() => switchMode(m)}
              >
                {t(`dataModel.playgroundMode_${m}`)}
              </button>
            ))}
          </div>
          <p className="entity-view__readonly">{t('dataModel.playgroundNoMetrics')}</p>
        </EntityViewPanel>
      </>
    );
  }

  if ((mode === 'builder' || mode === 'advanced') && !spec) {
    return (
      <>
        <EntityViewHeader title={t('dataModel.playgroundTitle')} subtitle={t('dataModel.playgroundHint')} />
        <EntityViewPanel>
          <p className="entity-view__readonly">{t('shared.loading')}</p>
        </EntityViewPanel>
      </>
    );
  }

  const runDisabled =
    running ||
    (mode === 'sql' ? !sqlText.trim() : !spec || !canRunQuery(spec));

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
              disabled={runDisabled}
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
        <div className="playground__query">
          <EntityViewPanel>
            <div className="playground__modes" role="tablist" aria-label={t('dataModel.playgroundModes')}>
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  className={`playground__mode${mode === m ? ' is-active' : ''}`}
                  onClick={() => switchMode(m)}
                >
                  {t(`dataModel.playgroundMode_${m}`)}
                </button>
              ))}
            </div>

            {mode === 'sql' ? (
              <div className="entity-view__form playground__form">
                <p className="page-subtitle">{t('dataModel.playgroundSqlHelp')}</p>
                {modelDatasets.length > 0 ? (
                  <div className="playground__sql-tables">
                    <span className="playground__label">{t('dataModel.playgroundSqlTables')}</span>
                    <ul className="playground__sql-table-list">
                      {modelDatasets.map((d) => (
                        <li key={d.id}>
                          <code>
                            {d.schema_name}.{d.table_name}
                          </code>
                          <span className="playground__sql-table-name">
                            {d.display_name || d.table_name}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="entity-view__readonly">{t('dataModel.playgroundSqlNoTables')}</p>
                )}
                <FormField label={t('dataModel.playgroundSql')}>
                  <textarea
                    className="ds-control playground__sql-editor"
                    rows={12}
                    spellCheck={false}
                    value={sqlText}
                    onChange={(e) => setSqlText(e.target.value)}
                    placeholder={t('dataModel.playgroundSqlPlaceholder')}
                  />
                </FormField>
                <div className="playground__field-group playground__field-group--limit">
                  <label className="playground__label" htmlFor="pg-sql-limit">
                    {t('dataModel.playgroundLimit')}
                  </label>
                  <input
                    id="pg-sql-limit"
                    className="ds-control"
                    type="number"
                    min={1}
                    max={1000}
                    value={sqlLimit}
                    onChange={(e) => setSqlLimit(Number(e.target.value) || 1)}
                  />
                </div>
              </div>
            ) : (
              <div className="entity-view__form playground__form">
                {mode === 'builder' ? (
                  <FormField label={t('datasets.metricName')}>
                    <select
                      className="ds-control"
                      value={spec!.metric ?? ''}
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
                ) : (
                  <>
                    <FormField label={t('dataModel.playgroundExpression')}>
                      <textarea
                        className="ds-control"
                        rows={3}
                        spellCheck={false}
                        value={typeof spec!.expression === 'string' ? spec!.expression : ''}
                        onChange={(e) => patch({ expression: e.target.value, metric: null })}
                        placeholder={t('dataModel.playgroundExpressionPlaceholder')}
                      />
                    </FormField>
                    <FormField label={t('dataModel.playgroundBaseDataset')}>
                      <select
                        className="ds-control"
                        value={spec!.base_dataset ?? ''}
                        onChange={(e) => patch({ base_dataset: e.target.value || null })}
                      >
                        <option value="">{t('dataModel.playgroundPickDataset')}</option>
                        {modelDatasets.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.display_name || d.table_name || d.id}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <div className="playground__section">
                      <span className="playground__label">{t('dataModel.playgroundJoins')}</span>
                      {modelJoins.length === 0 ? (
                        <p className="page-subtitle">{t('datasets.dash')}</p>
                      ) : (
                        <div className="chip-row">
                          {modelJoins.map((j) => {
                            const on = (spec!.joins ?? []).includes(j.id);
                            return (
                              <button
                                key={j.id}
                                type="button"
                                className={`chip${on ? ' is-selected' : ''}`}
                                onClick={() => toggleJoin(j)}
                              >
                                {j.name ||
                                  `${j.from_dataset_name ?? j.from_dataset_id} → ${j.to_dataset_name ?? j.to_dataset_id}`}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <FormField label={t('dataModel.playgroundWhere')}>
                      <textarea
                        className="ds-control"
                        rows={2}
                        spellCheck={false}
                        value={spec!.where ?? ''}
                        onChange={(e) => patch({ where: e.target.value })}
                        placeholder={t('dataModel.playgroundWherePlaceholder')}
                      />
                    </FormField>
                    <FormField label={t('dataModel.playgroundHaving')}>
                      <textarea
                        className="ds-control"
                        rows={2}
                        spellCheck={false}
                        value={spec!.having ?? ''}
                        onChange={(e) => patch({ having: e.target.value })}
                        placeholder={t('dataModel.playgroundHavingPlaceholder')}
                      />
                    </FormField>
                  </>
                )}

                <div className="playground__section">
                  <span className="playground__label">
                    {t('dataModel.playgroundDimensions')}
                    {spec!.group_by.length > 0 ? (
                      <span className="playground__group-count">
                        {t('dataModel.playgroundSelectedCount', { count: spec!.group_by.length })}
                      </span>
                    ) : null}
                  </span>

                  {spec!.group_by.length > 0 && (
                    <div className="chip-row">
                      {spec!.group_by.map((g) => {
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
                              aria-label={t('dataModel.playgroundRemoveDimension', {
                                name: fieldLabel(g.field),
                              })}
                              onClick={() => f && toggleGroup(f)}
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
                    isPicked={(id) => spec!.group_by.some((g) => g.field === id)}
                    onPick={(id) => {
                      const field = fields.find((f) => f.id === id);
                      if (field) toggleGroup(field);
                    }}
                    onBackspaceEmpty={() => {
                      const last = spec!.group_by[spec!.group_by.length - 1];
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
                  {mode === 'builder' && metric && (metric.filters?.length ?? 0) > 0 && (
                    <p className="page-subtitle">
                      {t('dataModel.playgroundMetricFilters')}:{' '}
                      {metric.filters
                        ?.map((f) => `${f.column} ${f.op} ${String(f.value ?? '')}`.trim())
                        .join(' · ')}
                    </p>
                  )}
                  <FilterRows
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
                        (metric && f.dataset_id !== metric.base_dataset_id) ||
                        (advancedBaseId && f.dataset_id !== advancedBaseId)
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
                        value={spec!.order_by[0]?.field ?? ''}
                        aria-label={t('dataModel.playgroundOrder')}
                        onChange={(e) =>
                          patch({
                            order_by: e.target.value
                              ? [
                                  {
                                    field: e.target.value,
                                    direction: spec!.order_by[0]?.direction ?? 'desc',
                                  },
                                ]
                              : [],
                          })
                        }
                      >
                        <option value="">{t('dataModel.playgroundOrderNone')}</option>
                        <option value="value">{t('dataModel.playgroundOrderValue')}</option>
                        {spec!.group_by.map((g) => (
                          <option key={g.field} value={fieldLabel(g.field)}>
                            {fieldLabel(g.field)}
                          </option>
                        ))}
                      </select>
                      <select
                        className="ds-control playground__direction"
                        value={spec!.order_by[0]?.direction ?? 'desc'}
                        aria-label={t('dataModel.playgroundDirection')}
                        disabled={spec!.order_by.length === 0}
                        onChange={(e) =>
                          patch({
                            order_by: [
                              {
                                field: spec!.order_by[0]?.field ?? 'value',
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
                      value={spec!.limit}
                      onChange={(e) => patch({ limit: Number(e.target.value) || 1 })}
                    />
                  </div>
                </div>
              </div>
            )}
          </EntityViewPanel>

          {mode === 'builder' && metric && (
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
                  {usedJoins.length
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
          saveDraft={
            mode === 'sql'
              ? null
              : modelFindingDraft({
                  modelId,
                  modelName: model.name,
                  metricName: metrics.find((m) => m.id === spec?.metric)?.name,
                  spec,
                  result,
                })
          }
        />
      </div>
    </>
  );
}
