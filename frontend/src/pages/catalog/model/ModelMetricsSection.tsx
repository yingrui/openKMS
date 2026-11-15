import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleCheck, CircleHelp, CircleX, ListChecks, Loader2, Pencil, Plus, Terminal, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { fetchDatasets, type DatasetResponse } from '../../../data/datasetsApi';
import { fetchDatasetJoins, type DatasetJoinResponse } from '../../../data/joinsApi';
import {
  createMetric,
  deleteMetric,
  fetchMetrics,
  makeMetricExpression,
  metricExpressionSql,
  updateMetric,
  type MetricAdditivity,
  type MetricResponse,
} from '../../../data/metricsApi';
import { useConfirm } from '../../../contexts/ConfirmContext';
import {
  Dialog,
  FormField,
  TableRowActionButton,
  TableRowActionCell,
  TableRowActions,
} from '../../../styles/design-system/index';
import { EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { evaluateRules, fetchRules, type RuleOut } from '../../../data/rulesApi';
import { RunRulesDialog, type RunParams } from '../rules/RunRulesDialog';
import { useSemanticModelDetail } from './useSemanticModelDetail';
import { datasetLabel } from '../datasetLabel';
import '../../../styles/metrics.scss';
import { aiContextFields, aiContextPayload } from './metricAiContext';

const ADDITIVITY = ['additive', 'non_additive'] as const;

/** Model → Metrics: author model-level metrics (Ossie SQL expressions). Running is **Try**. */
export function ModelMetricsSection() {
  const { t } = useTranslation('ontology');
  const confirm = useConfirm();
  const { model } = useSemanticModelDetail();
  const semanticModelId = model.id;
  const datasetIds = model.dataset_ids;

  const [metrics, setMetrics] = useState<MetricResponse[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [joins, setJoins] = useState<DatasetJoinResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<RuleOut[]>([]);
  const [coverage, setCoverage] = useState<'all' | 'covered' | 'uncovered'>('all');
  const [runMetric, setRunMetric] = useState<MetricResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MetricResponse | null>(null);
  const [name, setName] = useState('');
  const [baseDatasetId, setBaseDatasetId] = useState('');
  const [additivity, setAdditivity] = useState<MetricAdditivity>('additive');
  const [timeMode, setTimeMode] = useState<'period' | 'snapshot' | 'none'>('none');
  const [timeDimension, setTimeDimension] = useState('');
  const [expression, setExpression] = useState('');
  const [datatype, setDatatype] = useState('');
  const [selectedJoins, setSelectedJoins] = useState<string[]>([]);
  const [definition, setDefinition] = useState('');
  const [aiInstructions, setAiInstructions] = useState('');
  // The three keys a consumer can rely on; the editor keeps them as plain lists, not free-form JSON.
  const [aiSynonyms, setAiSynonyms] = useState('');
  const [aiExamples, setAiExamples] = useState('');
  const [aiNotFor, setAiNotFor] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, ds, j, r] = await Promise.all([
        fetchMetrics(semanticModelId),
        fetchDatasets(),
        fetchDatasetJoins(),
        fetchRules(),
      ]);
      setMetrics(m.items);
      setRules(r);
      setDatasets(ds.items.filter((d) => datasetIds.includes(d.id)));
      setJoins(j.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [semanticModelId, datasetIds, t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Which rules reference each metric, and the worst last result among them. */
  const checksByMetric = useMemo(() => {
    const map = new Map<string, { rules: RuleOut[]; worst: 'fail' | 'unknown' | 'pass' | null }>();
    for (const rule of rules) {
      for (const metricId of rule.metric_ids ?? []) {
        const entry = map.get(metricId) ?? { rules: [], worst: null as null | 'fail' | 'unknown' | 'pass' };
        entry.rules.push(rule);
        const status = (rule.last_status as 'fail' | 'unknown' | 'pass' | null) ?? null;
        const rank = { fail: 3, unknown: 2, pass: 1 } as const;
        if (status && (!entry.worst || rank[status] > rank[entry.worst])) entry.worst = status;
        map.set(metricId, entry);
      }
    }
    return map;
  }, [rules]);

  const shownMetrics = useMemo(() => {
    if (coverage === 'all') return metrics;
    return metrics.filter((metric) =>
      coverage === 'covered' ? checksByMetric.has(metric.id) : !checksByMetric.has(metric.id),
    );
  }, [metrics, coverage, checksByMetric]);

  const runChecks = async (params: RunParams) => {
    if (!runMetric) return;
    setRunning(true);
    try {
      const result = await evaluateRules({
        metric_id: runMetric.id,
        period_start: params.period_start,
        period_end: params.period_end,
      });
      toast.success(
        t('dataModel.checksRun', {
          count: result.results.length,
          failed: result.failed,
          unknown: result.unknown,
        }),
      );
      setRunMetric(null);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('rules.toastRunFailed'));
    } finally {
      setRunning(false);
    }
  };

  // Relationships touching the selected base dataset (the metric's join graph).
  const baseJoins = useMemo(
    () =>
      joins.filter(
        (j) =>
          (j.from_dataset_id === baseDatasetId || j.to_dataset_id === baseDatasetId) &&
          datasetIds.includes(j.from_dataset_id) &&
          datasetIds.includes(j.to_dataset_id),
      ),
    [joins, baseDatasetId, datasetIds],
  );

  const openCreate = () => {
    setEditing(null);
    setName('');
    setBaseDatasetId(datasets[0]?.id ?? '');
    setAdditivity('additive');
    setTimeMode('none');
    setTimeDimension('');
    setExpression('');
    setDatatype('');
    setSelectedJoins([]);
    setDefinition('');
    setAiInstructions('');
    setShowForm(true);
  };

  const openEdit = (m: MetricResponse) => {
    setEditing(m);
    setName(m.name);
    setBaseDatasetId(m.base_dataset_id);
    setAdditivity(m.additivity);
    setTimeMode(m.time_mode);
    setTimeDimension(m.time_dimension ?? '');
    setExpression(metricExpressionSql(m));
    setDatatype(m.datatype ?? '');
    setSelectedJoins((m.joins as string[] | null) ?? []);
    setDefinition(m.business_definition ?? '');
    const ai = aiContextFields(m.ai_context);
    setAiInstructions(ai.instructions);
    setAiSynonyms(ai.synonyms);
    setAiExamples(ai.examples);
    setAiNotFor(ai.notFor);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t('datasets.metricNameRequired'));
      return;
    }
    if (!baseDatasetId) {
      toast.error(t('datasets.metricBaseRequired'));
      return;
    }
    if (!expression.trim()) {
      toast.error(t('datasets.metricExpressionRequired'));
      return;
    }
    const payload = {
      name: name.trim(),
      semantic_model_id: semanticModelId,
      base_dataset_id: baseDatasetId,
      business_definition: definition.trim() || null,
      additivity,
      time_mode: timeMode,
      time_dimension: timeMode === 'period' ? timeDimension.trim() || null : null,
      expression: makeMetricExpression(expression.trim()),
      datatype: datatype.trim() || null,
      joins: selectedJoins,
      // Only the keys that carry something are sent; an empty list is not context.
      ai_context: aiContextPayload(aiInstructions, aiSynonyms, aiExamples, aiNotFor),
    };
    setSubmitting(true);
    try {
      if (editing) {
        await updateMetric(editing.id, payload);
        toast.success(t('datasets.metricSaved'));
      } else {
        await createMetric(payload);
        toast.success(t('datasets.metricCreated'));
      }
      setShowForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.metricSaveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (m: MetricResponse) => {
    if (
      !(await confirm({
        title: t('shared.delete'),
        message: t('datasets.metricDeleteConfirm', { name: m.name }),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    try {
      await deleteMetric(m.id);
      toast.success(t('datasets.metricDeleted'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.metricDeleteFailed'));
    }
  };

  /** Which dataset a metric sits on, by id — a lookup, not the label helper. */
  const datasetNameById = (id: string) => {
    const d = datasets.find((x) => x.id === id);
    return d ? datasetLabel(d) : id;
  };

  return (
    <>
      <EntityViewHeader
        title={t('dataModel.metrics')}
        actions={
          <>
            <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} aria-hidden />
            {t('datasets.addMetric')}
            </button>
          </>
        }
      />

      {/* Content toolbar under the divider: the filter changes what the list shows, so it lives with it. */}
      <div className="metrics-toolbar">
        <span className="metrics-toolbar__label">
          {t('dataModel.metricCount', { count: shownMetrics.length })}
        </span>
        <div className="metrics-toolbar__filters">
          <label className="metrics-toolbar__label">
            {t('dataModel.coverageFilter')}
            <select
              className="ds-control"
              value={coverage}
              onChange={(e) => setCoverage(e.target.value as typeof coverage)}
            >
              <option value="all">{t('dataModel.coverageAll')}</option>
              <option value="covered">{t('dataModel.coverageCovered')}</option>
              <option value="uncovered">{t('dataModel.coverageUncovered')}</option>
            </select>
          </label>
        </div>
      </div>

      <EntityViewPanel>
        {loading ? (
          <p className="entity-view__readonly">{t('shared.loading')}</p>
        ) : metrics.length === 0 ? (
          <p className="entity-view__readonly">{t('datasets.metricEmpty')}</p>
        ) : (
        <div className="ds-table-wrap ds-table-wrap--flush">
          <table className="console-table">
            <thead>
              <tr>
                <th>{t('datasets.metricName')}</th>
                <th>{t('datasets.metricBaseDataset')}</th>
                <th>{t('datasets.metricType')}</th>
                <th>{t('datasets.metricExpression')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shownMetrics.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.name}</strong>
                    {(() => {
                      const entry = checksByMetric.get(m.id);
                      if (!entry) {
                        return (
                          <span
                            className="metric-check metric-check--none"
                            title={t('dataModel.checkUncovered')}
                          >
                            <CircleHelp size={12} aria-hidden />
                            {t('dataModel.checkUncoveredShort')}
                          </span>
                        );
                      }
                      const Icon =
                        entry.worst === 'fail' ? CircleX : entry.worst === 'pass' ? CircleCheck : CircleHelp;
                      const tone =
                        entry.worst === 'fail' ? 'fail' : entry.worst === 'pass' ? 'pass' : 'unknown';
                      return (
                        <span
                          className={`metric-check metric-check--${tone}`}
                          title={entry.rules
                            .map(
                              (rule) =>
                                `${rule.name ?? rule.rule_id}：${rule.last_period_start ?? '—'} ${
                                  rule.last_status ?? t('rules.neverRun')
                                }${rule.last_reason ? `（${rule.last_reason}）` : ''}`,
                            )
                            .join('\n')}
                        >
                          <Icon size={12} aria-hidden />
                          {entry.worst
                            ? t(`dataModel.check${entry.worst === 'fail' ? 'Fail' : entry.worst === 'pass' ? 'Pass' : 'Unknown'}`)
                            : t('dataModel.checkNeverRun')}
                        </span>
                      );
                    })()}
                  </td>
                  <td>{m.base_dataset_name ?? datasetNameById(m.base_dataset_id)}</td>
                  <td>
                    {m.time_mode !== 'none' ? (
                      <span className={`metric-additivity metric-additivity--${m.time_mode}`}>
                        {m.time_mode === 'period'
                          ? `${t('dataModel.timeModePeriod')} · ${m.time_dimension ?? ''}`
                          : t('dataModel.timeModeSnapshot')}
                      </span>
                    ) : null}
                    <span className={`metric-additivity metric-additivity--${m.additivity}`}>
                      {m.additivity === 'non_additive'
                        ? t('datasets.metricNonAdditive')
                        : t('datasets.metricAdditive')}
                    </span>
                  </td>
                  <td>
                    <code>{metricExpressionSql(m)}</code>
                    {(m.depends_on ?? []).length > 0 ? (
                      <p className="metric-depends-on">
                        {t('datasets.metricDependsOn')}: {(m.depends_on ?? []).map((d) => d.name).join(' · ')}
                      </p>
                    ) : null}
                  </td>
                  <TableRowActionCell>
                    <TableRowActions>
                      <TableRowActionButton
                        title={t('dataModel.checksRunShort')}
                        aria-label={t('dataModel.checksRunShort')}
                        icon={<ListChecks size={16} aria-hidden />}
                        onClick={() => setRunMetric(m)}
                      />
                      {/* A link, not a button: it navigates, and the DS class gives it the same skin. */}
                      <Link
                        className="ds-table-row-action"
                        to={`/data-model/${model.id}/playground?q=${encodeURIComponent(
                          JSON.stringify({ metric: m.id }),
                        )}`}
                        title={t('dataModel.playgroundOpen')}
                        aria-label={t('dataModel.playgroundOpen')}
                      >
                        <Terminal size={16} aria-hidden />
                      </Link>
                      <TableRowActionButton
                        title={t('datasets.editMetric')}
                        aria-label={t('datasets.editMetric')}
                        icon={<Pencil size={16} aria-hidden />}
                        onClick={() => openEdit(m)}
                      />
                      <TableRowActionButton
                        title={t('shared.delete')}
                        aria-label={t('shared.delete')}
                        variant="danger"
                        icon={<Trash2 size={16} aria-hidden />}
                        onClick={() => void handleDelete(m)}
                      />
                    </TableRowActions>
                  </TableRowActionCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </EntityViewPanel>

      <RunRulesDialog
        open={runMetric !== null}
        busy={running}
        onClose={() => !running && setRunMetric(null)}
        onRun={(params) => void runChecks(params)}
      />

      <Dialog
        open={showForm}
        onClose={() => !submitting && setShowForm(false)}
        closeDisabled={submitting}
        title={editing ? t('datasets.editMetric') : t('datasets.addMetric')}
        closeAriaLabel={t('datasets.closeAria')}
        size="md"
        footer={<>              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => !submitting && setShowForm(false)}
                disabled={submitting}
              >
                {t('shared.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleSubmit()}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 size={16} className="console-loading-spinner" />
                ) : (
                  t('shared.save')
                )}
              </button>
        </>}
      >
              <FormField label={t('datasets.metricName')}>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
              </FormField>
              <FormField label={t('datasets.metricBaseDataset')}>
                <select value={baseDatasetId} onChange={(e) => setBaseDatasetId(e.target.value)}>
                  <option value="">{t('datasets.selectDataset')}</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {datasetLabel(d)}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label={t('datasets.metricType')} hint={t('datasets.metricAdditivityHint')}>
                <select
                  value={additivity}
                  onChange={(e) => setAdditivity(e.target.value as MetricAdditivity)}
                >
                  {ADDITIVITY.map((value) => (
                    <option key={value} value={value}>
                      {value === 'non_additive'
                        ? t('datasets.metricNonAdditive')
                        : t('datasets.metricAdditive')}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label={t('dataModel.timeMode')} hint={t('dataModel.timeModeHint')}>
                <select
                  value={timeMode}
                  onChange={(e) => setTimeMode(e.target.value as typeof timeMode)}
                >
                  <option value="none">{t('dataModel.timeModeNone')}</option>
                  <option value="period">{t('dataModel.timeModePeriod')}</option>
                  <option value="snapshot">{t('dataModel.timeModeSnapshot')}</option>
                </select>
              </FormField>
              {timeMode === 'period' ? (
                <FormField label={t('dataModel.timeDimension')} hint={t('dataModel.timeDimensionHint')}>
                  <input
                    type="text"
                    value={timeDimension}
                    onChange={(e) => setTimeDimension(e.target.value)}
                    placeholder="trade_date"
                  />
                </FormField>
              ) : null}
              <FormField label={t('datasets.metricExpression')} hint={t('datasets.metricExpressionHint')}>
                <textarea
                  rows={3}
                  value={expression}
                  onChange={(e) => setExpression(e.target.value)}
                  placeholder='SUM("amount") / COUNT(DISTINCT "id")'
                />
              </FormField>
              <FormField label={t('datasets.metricDatatype')}>
                <input
                  type="text"
                  value={datatype}
                  onChange={(e) => setDatatype(e.target.value)}
                  placeholder={t('dataModel.metricTypePlaceholder')}
                />
              </FormField>
              {baseJoins.length > 0 && (
                <FormField label={t('datasets.metricJoins')}>
                  <div className="dataset-metric-joins">
                    {baseJoins.map((j) => {
                      const other =
                        j.from_dataset_id === baseDatasetId
                          ? j.to_dataset_name
                          : j.from_dataset_name;
                      return (
                        <label key={j.id} className="ds-check-row">
                          <input
                            type="checkbox"
                            checked={selectedJoins.includes(j.id)}
                            onChange={(e) =>
                              setSelectedJoins((prev) =>
                                e.target.checked
                                  ? [...prev, j.id]
                                  : prev.filter((x) => x !== j.id),
                              )
                            }
                          />
                          <span>{other ?? t('datasets.dash')}</span>
                        </label>
                      );
                    })}
                  </div>
                </FormField>
              )}
              <FormField label={t('datasets.metricBusinessDefinition')}>
                <textarea
                  rows={2}
                  value={definition}
                  onChange={(e) => setDefinition(e.target.value)}
                />
              </FormField>
              <FormField label={t('datasets.aiInstructions')}>
                <textarea
                  rows={2}
                  value={aiInstructions}
                  onChange={(e) => setAiInstructions(e.target.value)}
                />
              </FormField>
              <FormField label={t('datasets.aiSynonyms')} hint={t('datasets.aiListsHint')}>
                <input
                  type="text"
                  value={aiSynonyms}
                  onChange={(e) => setAiSynonyms(e.target.value)}
                  placeholder={t('datasets.aiSynonymsPlaceholder')}
                />
              </FormField>
              <FormField label={t('datasets.aiExamples')} hint={t('datasets.aiExamplesHint')}>
                <input
                  type="text"
                  value={aiExamples}
                  onChange={(e) => setAiExamples(e.target.value)}
                  placeholder={t('datasets.aiExamplesPlaceholder')}
                />
              </FormField>
              <FormField label={t('datasets.aiNotFor')} hint={t('datasets.aiNotForHint')}>
                <input
                  type="text"
                  value={aiNotFor}
                  onChange={(e) => setAiNotFor(e.target.value)}
                  placeholder={t('datasets.aiNotForPlaceholder')}
                />
              </FormField>
      </Dialog>

    </>
  );
}
