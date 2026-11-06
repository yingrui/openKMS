import { Copy, Loader2, Play, X } from 'lucide-react';
import { FormField } from '../../styles/design-system';
import { isTimeDimension } from '../../data/semanticModelFieldsApi';
import { EntityViewHeader, EntityViewPanel } from './EntityViewShell';
import { ModelPlaygroundAnswer } from './ModelPlaygroundAnswer';
import { modelFindingDraft } from './findingDraft';
import { emptySpec } from './modelPlaygroundSpec';
import { ChipPicker } from '../../components/ontology/ChipPicker';
import { FilterRows } from '../../components/ontology/FilterRows';
import {
  GRANULARITIES,
  MODES,
  OPS,
  metricExpressionText,
  useModelPlayground,
} from './useModelPlayground';

/**
 * Model → Playground: Builder (metric UI), Advanced (expression/where/having), or SQL Lab.
 * Read-only and capped; the definition is one click away in Builder.
 */
export function ModelPlaygroundSection() {
  const pg = useModelPlayground();
  const {
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
    mode,
    spec,
    patch,    filterRows,
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
  } = pg;

  const modeTabs = (
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
  );

  // A restricted model is answered inside one granted resource; the choice is part of the query,
  // not an afterthought, so it sits above the editor and blocks Run until it is made.
  const resourceScope = restricted ? (
    <div className="playground__resource">
      <span className="playground__label">{t('dataModel.playgroundResource')}</span>
      {resources.length > 0 ? (
        <select
          className="ds-control"
          value={activeResourceId}
          aria-label={t('dataModel.playgroundResource')}
          onChange={(e) => setResourceId(e.target.value)}
        >
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      ) : (
        <p className="page-subtitle">{t('dataModel.playgroundNoResource')}</p>
      )}
      {activeResource?.row_policy.length ? (
        <p className="page-subtitle">
          {t('dataModel.playgroundResourceRows', {
            count: activeResource.row_policy.length,
          })}
        </p>
      ) : null}
    </div>
  ) : null;

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

  if (restricted && !loading && resources.length === 0) {
    return (
      <>
        <EntityViewHeader title={t('dataModel.playgroundTitle')} subtitle={t('dataModel.playgroundHint')} />
        <EntityViewPanel>
          <p className="entity-view__readonly">{t('dataModel.playgroundNoResource')}</p>
        </EntityViewPanel>
      </>
    );
  }

  if (mode === 'builder' && metrics.length === 0) {
    return (
      <>
        <EntityViewHeader title={t('dataModel.playgroundTitle')} subtitle={t('dataModel.playgroundHint')} />
        <EntityViewPanel>
          {modeTabs}
          {resourceScope}
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
            {modeTabs}
            {resourceScope}

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
