import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Play, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchMetrics, type MetricResponse } from '../../data/metricsApi';
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
import { EntityViewHeader, EntityViewPanel } from './EntityViewShell';
import { useSemanticModelDetail } from './SemanticModelDetailPage';

const GRANULARITIES = ['day', 'week', 'month', 'quarter', 'year'];
const OPS = ['=', '!=', '>', '>=', '<', '<=', 'like', 'in', 'between', 'is_null', 'is_not_null'];
/** Ops that need no value / two values. */
const NO_VALUE = new Set(['is_null', 'is_not_null']);

type FilterRow = { id: number; field: string; op: string; value: string; value2: string };

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

  const [metrics, setMetrics] = useState<MetricResponse[]>([]);
  const [fields, setFields] = useState<SemanticModelFieldResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [spec, setSpec] = useState<SemanticModelQuerySpec | null>(null);
  const [filterRows, setFilterRows] = useState<FilterRow[]>([]);
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<SemanticModelQueryResponse | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([fetchMetrics(modelId), fetchModelFields(modelId)])
      .then(([metricPage, fieldPage]) => {
        if (cancelled) return;
        setMetrics(metricPage.items);
        setFields(fieldPage.items);
        const fromUrl = specFromUrl(params.get('q'));
        const initial = fromUrl ?? emptySpec(metricPage.items[0]?.id ?? '');
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
      })
      .catch(
        (e) => !cancelled && toast.error(e instanceof Error ? e.message : t('datasets.loadFailed')),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId, t]);

  const metric = useMemo(
    () => metrics.find((m) => m.id === spec?.metric) ?? null,
    [metrics, spec?.metric],
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
      setParams({ q: JSON.stringify(runSpec) }, { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataModel.playgroundRunFailed'));
    } finally {
      setRunning(false);
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
                <span className="playground__label">{t('dataModel.playgroundDimensions')}</span>
                {/* ds-control-exempt: `.console-datasets-search` styles this input */}
                <div className="console-datasets-search">
                  <Search size={18} aria-hidden />
                  <input
                    type="search"
                    aria-label={t('datasets.searchAria')}
                    placeholder={t('dataModel.datasetFieldSearch')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

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

                <div className="playground__fields">
                  {[...timeDims, ...otherFields]
                    .filter((f) =>
                      !search.trim()
                        ? true
                        : f.name.toLowerCase().includes(search.trim().toLowerCase()) ||
                          (f.label ?? '').toLowerCase().includes(search.trim().toLowerCase()),
                    )
                    .map((f) => (
                      <label key={f.id} className="ds-check-row">
                        <input
                          type="checkbox"
                          checked={grouped.has(f.id)}
                          onChange={() => toggleGroup(f)}
                        />
                        <span>
                          {f.name}
                          {f.label ? <em className="model-wizard__ds"> · {f.label}</em> : null}
                          {isTimeDimension(f) ? (
                            <em className="model-wizard__ds"> · {t('dataModel.dimensionTime')}</em>
                          ) : null}
                        </span>
                      </label>
                    ))}
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
                  <dd>{metric.joins?.length ? String(metric.joins.length) : t('datasets.dash')}</dd>
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

        {/* ---------- the answer ---------- */}
        <div className="playground__answer">
          <EntityViewPanel title={t('dataModel.playgroundResult')}>
            {!result ? (
              <p className="entity-view__readonly">{t('dataModel.playgroundEmpty')}</p>
            ) : (
              <>
                <p className="page-subtitle">
                  {t('dataModel.playgroundRowCount', { count: result.row_count })}
                  {result.capped ? ` · ${t('dataModel.playgroundCapped')}` : ''}
                  {` · ${result.duration_ms} ms`}
                </p>
                {result.rows.length === 0 ? (
                  <p className="entity-view__readonly">{t('dataModel.playgroundNoRows')}</p>
                ) : (
                  <div className="ds-table-wrap ds-table-wrap--flush">
                    <table className="console-table">
                      <thead>
                        <tr>
                          {result.columns.map((c) => (
                            <th key={c}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.rows.map((row, i) => (
                          <tr key={i}>
                            {result.columns.map((c) => (
                              <td key={c}>
                                {row[c] === null || row[c] === undefined
                                  ? t('datasets.dash')
                                  : String(row[c])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm playground__sql-toggle"
                  onClick={() => setShowSql((v) => !v)}
                >
                  {t('dataModel.playgroundSql')}
                </button>
                {showSql && <pre className="playground__sql">{result.sql}</pre>}
              </>
            )}
          </EntityViewPanel>

        </div>
      </div>
    </>
  );
}

function metricExpressionText(metric: MetricResponse): string {
  const dialect = metric.expression?.dialects?.find((d) => d.dialect === 'ANSI_SQL');
  return dialect?.expression ?? '';
}
