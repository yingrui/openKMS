import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import type { ColumnMetadata, DatasetResponse } from '../../data/datasetsApi';
import type { MetricResponse } from '../../data/metricsApi';
import type { SemanticModelResponse } from '../../data/semanticModelsApi';
import type { SemanticModelFieldResponse } from '../../data/semanticModelFieldsApi';
import { FormField } from '../../styles/design-system';
import { OPERATORS, columnKind } from './datasetRowsFilter';
import { FilterRows } from '../../components/ontology/FilterRows';
import { AGGREGATE_FNS, GRANULARITIES, type AddReportForm } from './addReportForm';

/**
 * The source and the query, for a report being added to a dashboard.
 *
 * Three shapes, and no more: a dataset's **rows**, a dataset's **summary** (group by + aggregates)
 * and a model's **metric** by fields. Everything a report can otherwise express — joined fields,
 * several orders, a window — is a query built where it belongs (the Playground, the Data tab) and
 * saved to a dashboard; this form says so rather than half-supporting it.
 *
 * Presentational: the dialog owns the option lists and fetches the chosen source's metrics, fields
 * or columns, so this stays a form over `AddReportForm`.
 */
export function ReportQueryBuilder({
  form,
  onChange,
  datasets,
  models,
  metrics,
  fields,
  datasetColumns,
}: {
  form: AddReportForm;
  onChange: (next: AddReportForm) => void;
  datasets: DatasetResponse[];
  models: SemanticModelResponse[];
  metrics: MetricResponse[];
  fields: SemanticModelFieldResponse[];
  datasetColumns: ColumnMetadata[];
}) {
  const { t } = useTranslation('ontology');
  const patch = (changes: Partial<AddReportForm>) => onChange({ ...form, ...changes });

  const datasetOptions = datasets.map((d) => ({
    id: d.id,
    label: d.display_name || `${d.schema_name}.${d.table_name}`,
  }));
  const datasetColumnOptions = datasetColumns.map((c) => ({
    id: c.column_name,
    label: c.column_name,
  }));
  const dateColumns = new Set(
    datasetColumns.filter((c) => columnKind(c.ontology_type) === 'date').map((c) => c.column_name),
  );
  const timeFields = new Set(
    fields.filter((f) => f.dimension?.is_time || /date|time/.test(f.datatype ?? '')).flatMap((f) => [f.id, f.name]),
  );
  const columnLabel = (column: string) =>
    datasetColumns.find((c) => c.column_name === column)?.ontology_type ?? '';

  return (
    <>
      <FormField label={t('dataExplorer.reportSource')}>
        <select
          value={form.kind}
          onChange={(e) => patch({ kind: e.target.value as AddReportForm['kind'] })}
        >
          <option value="dataset">{t('dataExplorer.sourceDataset')}</option>
          <option value="semantic_model">{t('dataExplorer.sourceModel')}</option>
        </select>
      </FormField>

      {form.kind === 'dataset' ? (
        <>
          <FormField label={t('dataExplorer.sourceDataset')}>
            <select value={form.datasetId} onChange={(e) => patch({ datasetId: e.target.value })}>
              <option value="">{t('dataExplorer.sourceMissing')}</option>
              {datasetOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </FormField>
          {form.datasetId && (
            <>
              <FormField label={t('dataExplorer.queryShape')}>
                <select
                  value={form.datasetMode}
                  onChange={(e) => patch({ datasetMode: e.target.value as AddReportForm['datasetMode'] })}
                >
                  <option value="rows">{t('dataExplorer.queryRows')}</option>
                  <option value="summary">{t('dataExplorer.querySummary')}</option>
                </select>
              </FormField>

              {form.datasetMode === 'rows' ? (
                <>
                  <FilterRows
                    rows={form.filters}
                    onChange={(filters) => patch({ filters })}
                    columns={datasetColumnOptions}
                    timeRefs={dateColumns}
                    ops={OPERATORS.map((op) => op.id)}
                  />
                  <div className="openkms-flex-row-gap">
                    <FormField label={t('dataModel.playgroundOrder')}>
                      <select value={form.sort} onChange={(e) => patch({ sort: e.target.value })}>
                        <option value="">{t('dataModel.playgroundOrderNone')}</option>
                        {datasetColumnOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    {form.sort && (
                      <FormField label={t('dataModel.playgroundDirection')}>
                        <select
                          value={form.order}
                          onChange={(e) => patch({ order: e.target.value as 'asc' | 'desc' })}
                        >
                          <option value="desc">{t('datasets.orderDesc')}</option>
                          <option value="asc">{t('datasets.orderAsc')}</option>
                        </select>
                      </FormField>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="openkms-flex-row-gap">
                    <FormField label={t('dataExplorer.queryGroupBy')}>
                      <select value={form.groupBy} onChange={(e) => patch({ groupBy: e.target.value })}>
                        <option value="">{t('datasets.selectColumn')}</option>
                        {datasetColumnOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    {dateColumns.has(form.groupBy) && (
                      <FormField label={t('dataExplorer.queryGrain')}>
                        <select
                          value={form.granularity}
                          onChange={(e) => patch({ granularity: e.target.value })}
                        >
                          <option value="">{t('dataExplorer.queryNoGrain')}</option>
                          {GRANULARITIES.map((g) => (
                            <option key={g} value={g}>
                              {t(`dataExplorer.grain_${g}`)}
                            </option>
                          ))}
                        </select>
                      </FormField>
                    )}
                  </div>
                  {form.aggregates.map((aggregate, i) => (
                    <div key={i} className="openkms-flex-row-gap">
                      <FormField label={t('dataExplorer.queryAggregate')}>
                        <select
                          value={aggregate.fn}
                          onChange={(e) =>
                            patch({
                              aggregates: form.aggregates.map((a, j) =>
                                j === i ? { ...a, fn: e.target.value } : a,
                              ),
                            })
                          }
                        >
                          {AGGREGATE_FNS.map((fn) => (
                            <option key={fn} value={fn}>
                              {fn}
                            </option>
                          ))}
                        </select>
                      </FormField>
                      {aggregate.fn !== 'count' && (
                        <FormField label={t('dataExplorer.viewValueColumn')}>
                          <select
                            value={aggregate.column}
                            onChange={(e) =>
                              patch({
                                aggregates: form.aggregates.map((a, j) =>
                                  j === i ? { ...a, column: e.target.value } : a,
                                ),
                              })
                            }
                          >
                            <option value="">{t('datasets.selectColumn')}</option>
                            {datasetColumnOptions.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                                {columnLabel(c.id) ? ` · ${columnLabel(c.id)}` : ''}
                              </option>
                            ))}
                          </select>
                        </FormField>
                      )}
                      {form.aggregates.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          aria-label={t('shared.delete')}
                          onClick={() =>
                            patch({ aggregates: form.aggregates.filter((_, j) => j !== i) })
                          }
                        >
                          <X size={14} aria-hidden />
                        </button>
                      )}
                    </div>
                  ))}
                  {form.aggregates.length < 3 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => patch({ aggregates: [...form.aggregates, { fn: 'avg', column: '' }] })}
                    >
                      <Plus size={14} aria-hidden />
                      {t('dataExplorer.queryAddAggregate')}
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <FormField label={t('dataExplorer.sourceModel')}>
            <select value={form.modelId} onChange={(e) => patch({ modelId: e.target.value })}>
              <option value="">{t('dataExplorer.sourceMissing')}</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </FormField>
          {form.modelId && (
            <>
              <FormField label={t('dataExplorer.queryMetric')}>
                <select value={form.metric} onChange={(e) => patch({ metric: e.target.value })}>
                  <option value="">{t('dataExplorer.queryNoMetric')}</option>
                  {metrics.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </FormField>
              {form.modelGroupBy.map((group, i) => (
                <div key={i} className="openkms-flex-row-gap">
                  <FormField label={t('dataExplorer.queryGroupBy')}>
                    <select
                      value={group.field}
                      onChange={(e) =>
                        patch({
                          modelGroupBy: form.modelGroupBy.map((g, j) =>
                            j === i ? { ...g, field: e.target.value } : g,
                          ),
                        })
                      }
                    >
                      <option value="">{t('datasets.fieldName')}</option>
                      {fields.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  {timeFields.has(group.field) && (
                    <FormField label={t('dataExplorer.queryGrain')}>
                      <select
                        value={group.granularity}
                        onChange={(e) =>
                          patch({
                            modelGroupBy: form.modelGroupBy.map((g, j) =>
                              j === i ? { ...g, granularity: e.target.value } : g,
                            ),
                          })
                        }
                      >
                        <option value="">{t('dataExplorer.queryNoGrain')}</option>
                        {GRANULARITIES.map((g) => (
                          <option key={g} value={g}>
                            {t(`dataExplorer.grain_${g}`)}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    aria-label={t('shared.delete')}
                    onClick={() => patch({ modelGroupBy: form.modelGroupBy.filter((_, j) => j !== i) })}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
              ))}
              {form.modelGroupBy.length < 3 && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => patch({ modelGroupBy: [...form.modelGroupBy, { field: '', granularity: '' }] })}
                >
                  <Plus size={14} aria-hidden />
                  {t('dataExplorer.queryAddGroup')}
                </button>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
