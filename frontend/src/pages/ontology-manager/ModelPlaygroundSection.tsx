import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Check, Copy, Loader2, Play, Plus, Search, X } from 'lucide-react';
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
import { ModelPlaygroundAnswer, type RunError } from './ModelPlaygroundAnswer';
import { useSemanticModelDetail } from './useSemanticModelDetail';

const GRANULARITIES = ['day', 'week', 'month', 'quarter', 'year'];
const OPS = ['=', '!=', '>', '>=', '<', '<=', 'like', 'in', 'between', 'is_null', 'is_not_null'];
/** Ops that need no value / two values. */
const NO_VALUE = new Set(['is_null', 'is_not_null']);

type FilterRow = { id: number; field: string; op: string; value: string; value2: string };

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

const emptySpec = (metricId: string): SemanticModelQuerySpec => ({
  metric: metricId,
  group_by: [],
  filters: [],
  order_by: [],
  limit: 100,
});

/** The query spec travels in the URL, so a question can be shared and re-run. */
function specFromUrl(raw: string | null): SemanticModelQuerySpec | null {
  if (!raw) return null;
  try {
    const spec = JSON.parse(raw) as SemanticModelQuerySpec;
    return spec && typeof spec.metric === 'string' ? spec : null;
  } catch {
    return null;
  }
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

  const [spec, setSpec] = useState<SemanticModelQuerySpec | null>(null);
  const [filterRows, setFilterRows] = useState<FilterRow[]>([]);
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
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

  /** Fields are the model's declared attributes of the metric's own dataset. */
  const groupable = useMemo(
    () => fields.filter((f) => !metric || f.dataset_id === metric.base_dataset_id),
    [fields, metric],
  );
  const timeDims = groupable.filter(isTimeDimension);
  const otherFields = groupable.filter((f) => !isTimeDimension(f));
  const grouped = useMemo(
    () => new Map((spec?.group_by ?? []).map((g) => [g.field, g])),
    [spec?.group_by],
  );
  const fieldLabel = (ref: string) => fields.find((f) => f.id === ref || f.name === ref)?.name ?? ref;
  const matched = (f: SemanticModelFieldResponse) =>
    !search.trim() ||
    f.name.toLowerCase().includes(search.trim().toLowerCase()) ||
    (f.label ?? '').toLowerCase().includes(search.trim().toLowerCase());
  const visibleOthers = otherFields.filter(matched);
  const visibleTimeDims = timeDims.filter(matched);
  /** Keyboard order matches what the menu draws: time dimensions first. */
  const pickerOptions = [...visibleTimeDims, ...visibleOthers];
  const activeOption =
    pickerOptions.length > 0 ? Math.min(highlighted, pickerOptions.length - 1) : -1;

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

  const toFilters = (rows: FilterRow[]) =>
    rows
      .filter((r) => r.field && r.op)
      .map((r) =>
        NO_VALUE.has(r.op)
          ? { field: r.field, op: r.op }
          : r.op === 'in'
            ? { field: r.field, op: r.op, value: r.value.split(',').map((v) => v.trim()).filter(Boolean) }
            : r.op === 'between'
              ? { field: r.field, op: r.op, value: [r.value, r.value2] }
              : { field: r.field, op: r.op, value: r.value },
      );

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
  // Arrow keys can walk past the menu's edge: keep the highlighted option in view.
  useEffect(() => {
    if (!pickerOpen || activeOption < 0) return;
    document
      .getElementById(`playground-field-${activeOption}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeOption, pickerOpen]);

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
                  <div className="playground__chips">
                    {spec.group_by.map((g) => {
                      const f = fields.find((x) => x.id === g.field || x.name === g.field);
                      return (
                        <span key={g.field} className="playground__chip">
                          {fieldLabel(g.field)}
                          {f && isTimeDimension(f) ? (
                            // ds-control-exempt: `.playground__chip select` styles this
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

                {/* Type to filter, Enter to add — the list only appears while it is being used. */}
                <div
                  className="playground__picker"
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                      setPickerOpen(false);
                    }
                  }}
                >
                  {/* ds-control-exempt: `.console-datasets-search` styles this input */}
                  <div className="console-datasets-search">
                    <Search size={18} aria-hidden />
                    <input
                      type="search"
                      role="combobox"
                      aria-expanded={pickerOpen}
                      aria-controls="playground-field-menu"
                      aria-autocomplete="list"
                      aria-activedescendant={
                        pickerOpen && activeOption >= 0 ? `playground-field-${activeOption}` : undefined
                      }
                      aria-label={t('dataModel.playgroundDimensions')}
                      placeholder={t('dataModel.playgroundFieldPickerPlaceholder')}
                      title={t('dataModel.playgroundFieldPickerTitle')}
                      value={search}
                      onFocus={() => setPickerOpen(true)}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setHighlighted(0);
                        setPickerOpen(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setPickerOpen(true);
                          setHighlighted((h) => Math.min(h + 1, pickerOptions.length - 1));
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setHighlighted((h) => Math.max(h - 1, 0));
                        } else if (e.key === 'Enter') {
                          const field = pickerOptions[activeOption];
                          if (pickerOpen && field) {
                            e.preventDefault();
                            toggleGroup(field);
                            setSearch('');
                            setHighlighted(0);
                          }
                        } else if (e.key === 'Escape') {
                          setPickerOpen(false);
                          setSearch('');
                        } else if (e.key === 'Backspace' && !search && spec.group_by.length > 0) {
                          // Autocomplete habit: backspace on an empty input drops the last chip.
                          const last = spec.group_by[spec.group_by.length - 1];
                          const field = fields.find((f) => f.id === last.field || f.name === last.field);
                          if (field) toggleGroup(field);
                        }
                      }}
                    />
                  </div>

                  {pickerOpen && (
                    <div
                      className="playground__field-menu"
                      id="playground-field-menu"
                      role="listbox"
                      aria-multiselectable
                      // Keep focus in the input so a row click lands before blur closes the menu.
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      {groupable.length === 0 ? (
                        <p className="entity-view__readonly">{t('dataModel.playgroundNoDimensions')}</p>
                      ) : pickerOptions.length === 0 ? (
                        <p className="entity-view__readonly">{t('dataModel.noSearchMatch')}</p>
                      ) : (
                        <ul>
                          {visibleTimeDims.length > 0 && (
                            <li className="playground__field-menu-head" role="presentation">
                              {t('dataModel.playgroundTimeDimensions')}
                            </li>
                          )}
                          {visibleTimeDims.map((f, i) => (
                            <FieldOption
                              key={f.id}
                              id={`playground-field-${i}`}
                              field={f}
                              selected={grouped.has(f.id)}
                              highlighted={i === activeOption}
                              onSelect={() => toggleGroup(f)}
                            />
                          ))}
                          {visibleOthers.length > 0 && (
                            <li className="playground__field-menu-head" role="presentation">
                              {t('datasets.fields')}
                              <span className="playground__group-count">
                                {t('dataModel.fieldCount', { count: visibleOthers.length })}
                              </span>
                            </li>
                          )}
                          {visibleOthers.map((f, i) => (
                            <FieldOption
                              key={f.id}
                              id={`playground-field-${visibleTimeDims.length + i}`}
                              field={f}
                              selected={grouped.has(f.id)}
                              highlighted={visibleTimeDims.length + i === activeOption}
                              onSelect={() => toggleGroup(f)}
                            />
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
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
                {filterRows.map((row) => (
                  <div key={row.id} className="playground__filter">
                    <select
                      className="ds-control"
                      value={row.field}
                      aria-label={t('datasets.fieldName')}
                      onChange={(e) =>
                        setFilterRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, field: e.target.value } : r)),
                        )
                      }
                    >
                      <option value="">{t('datasets.selectColumn')}</option>
                      {groupable.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="ds-control"
                      value={row.op}
                      aria-label={t('dataModel.playgroundOp')}
                      onChange={(e) =>
                        setFilterRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, op: e.target.value } : r)),
                        )
                      }
                    >
                      {OPS.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                    {!NO_VALUE.has(row.op) && (
                      <input
                        className="ds-control"
                        type="text"
                        value={row.value}
                        placeholder={row.op === 'between' ? t('dataModel.playgroundFrom') : ''}
                        onChange={(e) =>
                          setFilterRows((prev) =>
                            prev.map((r) => (r.id === row.id ? { ...r, value: e.target.value } : r)),
                          )
                        }
                      />
                    )}
                    {row.op === 'between' && (
                      <input
                        className="ds-control"
                        type="text"
                        value={row.value2}
                        placeholder={t('dataModel.playgroundTo')}
                        onChange={(e) =>
                          setFilterRows((prev) =>
                            prev.map((r) => (r.id === row.id ? { ...r, value2: e.target.value } : r)),
                          )
                        }
                      />
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      aria-label={t('shared.delete')}
                      onClick={() => setFilterRows((prev) => prev.filter((r) => r.id !== row.id))}
                    >
                      <X size={14} aria-hidden />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    setFilterRows((prev) => [
                      ...prev,
                      { id: Date.now(), field: '', op: '=', value: '', value2: '' },
                    ])
                  }
                >
                  <Plus size={14} aria-hidden />
                  {t('dataModel.playgroundAddFilter')}
                </button>
              </div>

              <div className="playground__section playground__section--row">
                <span className="playground__label">{t('dataModel.playgroundOrder')}</span>
                <select
                  className="ds-control"
                  value={spec.order_by[0]?.field ?? ''}
                  aria-label={t('dataModel.playgroundOrder')}
                  onChange={(e) =>
                    patch({
                      order_by: e.target.value
                        ? [{ field: e.target.value, direction: spec.order_by[0]?.direction ?? 'desc' }]
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
                  className="ds-control"
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

        <ModelPlaygroundAnswer result={result} runError={runError} filtersApplied={filtersApplied} />
      </div>
    </>
  );
}

/** One field in the group-by picker: name, its label, and the data type it produces. */
function FieldOption({
  id,
  field,
  selected,
  highlighted,
  onSelect,
}: {
  id: string;
  field: SemanticModelFieldResponse;
  selected: boolean;
  highlighted: boolean;
  onSelect: () => void;
}) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      className={`playground__field-option${highlighted ? ' playground__field-option--active' : ''}`}
      onClick={onSelect}
    >
      <span className="playground__field">
        <span className="playground__field-name">{field.name}</span>
        {field.label ? <span className="playground__field-label">{field.label}</span> : null}
        <span className="playground__field-type">{field.datatype ?? ''}</span>
      </span>
      {selected ? <Check size={14} className="playground__field-check" aria-hidden /> : null}
    </li>
  );
}

function metricExpressionText(metric: MetricResponse): string {
  const dialect = metric.expression?.dialects?.find((d) => d.dialect === 'ANSI_SQL');
  return dialect?.expression ?? '';
}
