import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BellRing, Loader2, Pencil, Play, Plus, Trash2 } from 'lucide-react';
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
import { Dialog, FormField, ResourceViewToggle } from '../../../styles/design-system/index';
import { EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { fetchEventSummary } from '../../../data/eventsApi';
import { fetchMetricGraph, type MetricGraph } from '../../../data/metricsApi';
import { useSemanticModelDetail } from './useSemanticModelDetail';
import { datasetLabel } from '../datasetLabel';
import '../../../styles/metrics.scss';
import { aiContextFields, aiContextPayload } from './metricAiContext';
import { MetricDependencyGraph } from './MetricDependencyGraph';

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
  const [openEvents, setOpenEvents] = useState<Record<string, number>>({});
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [graph, setGraph] = useState<MetricGraph | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MetricResponse | null>(null);
  const [name, setName] = useState('');
  const [baseDatasetId, setBaseDatasetId] = useState('');
  const [additivity, setAdditivity] = useState<MetricAdditivity>('additive');
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
      const [m, ds, j] = await Promise.all([
        fetchMetrics(semanticModelId),
        fetchDatasets(),
        fetchDatasetJoins(),
      ]);
      setMetrics(m.items);
      setDatasets(ds.items.filter((d) => datasetIds.includes(d.id)));
      setJoins(j.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [semanticModelId, datasetIds, t]);

  useEffect(() => {
    // Open events per metric: one summary call, so a row can show a badge without N+1 requests.
    void fetchEventSummary('metric')
      .then((counts) => {
        const next: Record<string, number> = {};
        for (const count of counts) if (count.open > 0) next[count.subject_id] = count.open;
        setOpenEvents(next);
      })
      .catch(() => setOpenEvents({}));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  // The graph is a view over definitions, so it is read when the view is opened — not kept in sync.
  useEffect(() => {
    if (view !== 'graph') return;
    let cancelled = false;
    void fetchMetricGraph(semanticModelId)
      .then((next) => {
        if (!cancelled) setGraph(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) setGraphError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [view, semanticModelId]);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setBaseDatasetId(datasets[0]?.id ?? '');
    setAdditivity('additive');
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
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} aria-hidden />
            {t('datasets.addMetric')}
          </button>
        }
      />

      {/* The switch is a content control, so it sits under the header divider, on the content's right
          edge — the header stays about the page (its identity and the one thing you can create). */}
      <div className={`metric-view${view === 'graph' ? ' metric-view--graph' : ''}`}>
        <div className="metric-view__bar">
          <p className="metric-view__summary">
            {t('dataModel.metricCount', { count: metrics.length })}
          </p>
          <ResourceViewToggle
            modes={['list', 'graph'] as const}
            value={view}
            onChange={(next) => setView(next)}
            labels={{ list: t('dataModel.metricViewList'), graph: t('dataModel.metricViewGraph') }}
          />
        </div>

        {view === 'graph' ? (
          graphError ? (
            <p className="rules-condition-warning">{graphError}</p>
          ) : graph ? (
            <MetricDependencyGraph graph={graph} />
          ) : (
            <p className="entity-view__readonly">{t('shared.loading')}</p>
          )
        ) : (
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
              {metrics.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.name}</strong>
                    {openEvents[m.id] ? (
                      <Link
                        className="metric-events-badge"
                        to={`/data-rules?tab=events&subject_type=metric&subject_id=${m.id}`}
                        title={t('dataModel.metricOpenEvents', { count: openEvents[m.id] })}
                      >
                        <BellRing size={12} aria-hidden />
                        {openEvents[m.id]}
                      </Link>
                    ) : null}
                  </td>
                  <td>{m.base_dataset_name ?? datasetNameById(m.base_dataset_id)}</td>
                  <td>
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
                  <td className="dataset-field-row__actions">
                    <Link
                      className="btn btn-secondary btn-sm"
                      to={`/data-model/${model.id}/playground?q=${encodeURIComponent(
                        JSON.stringify({ metric: m.id }),
                      )}`}
                      title={t('dataModel.playgroundOpen')}
                    >
                      <Play size={14} aria-hidden />
                    </Link>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => openEdit(m)}
                      title={t('datasets.editMetric')}
                    >
                      <Pencil size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void handleDelete(m)}
                      title={t('shared.delete')}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </EntityViewPanel>
        )}
      </div>

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
