import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Play, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchDatasetMetadata,
  fetchDatasets,
  queryDatasetRows,
  queryDatasetSummary,
  type ColumnMetadata,
  type DatasetResponse,
} from '../../data/datasetsApi';
import { fetchMetrics, type MetricResponse } from '../../data/metricsApi';
import { fetchModelFields, type SemanticModelFieldResponse } from '../../data/semanticModelFieldsApi';
import { fetchSemanticModels, querySemanticModel, type SemanticModelResponse } from '../../data/semanticModelsApi';
import { updateDashboard, type DashboardReport } from '../../data/dashboardsApi';
import { Dialog, FormField } from '../../styles/design-system';
import { ReportQueryBuilder } from './ReportQueryBuilder';
import { ReportViewFields } from './ReportViewFields';
import { emptyForm, toQuery, type AddReportForm } from './addReportForm';
import { buildReportEntry, guessView, type ReportDraftInput, type ViewDraft } from './reportDraft';

const EMPTY_VIEW: ViewDraft = { choice: 'none', valueColumn: '', axisColumn: '', y: [] };

/**
 * Add a report to **this** dashboard.
 *
 * The loop is the same one the Playground taught: build the query, **try it** (nothing is saved on a
 * guess), look at the result, decide how it is presented, then save it. The query can be a dataset's
 * rows, a dataset's summary or a model's metric by fields — the three shapes this form offers — and
 * anything richer is built in the Playground or the Data tab and saved from there.
 */
export function AddReportDialog({
  dashboardId,
  reports,
  onSaved,
}: {
  dashboardId: string;
  reports: DashboardReport[];
  onSaved: () => void;
}) {
  const { t } = useTranslation('ontology');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AddReportForm>(() => emptyForm());
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [models, setModels] = useState<SemanticModelResponse[]>([]);
  const [metrics, setMetrics] = useState<MetricResponse[]>([]);
  const [fields, setFields] = useState<SemanticModelFieldResponse[]>([]);
  const [columns, setColumns] = useState<ColumnMetadata[]>([]);
  const [result, setResult] = useState<{ columns: string[]; rows: Array<Record<string, unknown>> } | null>(null);
  const [title, setTitle] = useState('');
  const [insight, setInsight] = useState('');
  const [view, setView] = useState<ViewDraft>(EMPTY_VIEW);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);

  const openDialog = useCallback(() => {
    setForm(emptyForm());
    setResult(null);
    setView(EMPTY_VIEW);
    setTitle('');
    setInsight('');
    setOpen(true);
    void Promise.all([fetchDatasets(), fetchSemanticModels()])
      .then(([d, m]) => {
        setDatasets(d.items);
        setModels(m.items);
      })
      .catch(() => undefined);
  }, []);

  /** The chosen source decides what its query can be written against. */
  const changeForm = (next: AddReportForm) => {
    const sourceChanged = next.datasetId !== form.datasetId || next.modelId !== form.modelId;
    if (sourceChanged) {
      setResult(null);
      setColumns([]);
      setMetrics([]);
      setFields([]);
      if (next.datasetId) {
        void fetchDatasetMetadata(next.datasetId).then(setColumns).catch(() => undefined);
      }
      if (next.modelId) {
        void Promise.all([fetchMetrics(next.modelId), fetchModelFields(next.modelId)])
          .then(([m, f]) => {
            setMetrics(m.items);
            setFields(f.items);
          })
          .catch(() => undefined);
      }
    }
    setForm(next);
  };

  const run = async () => {
    const spec = toQuery(form);
    if (!spec.ok) {
      toast.error(t(`dataExplorer.queryProblem_${spec.reason}`));
      return;
    }
    setRunning(true);
    try {
      const answer =
        spec.kind === 'semantic_model'
          ? await querySemanticModel(spec.id, spec.query as never)
          : form.datasetMode === 'summary'
            ? await queryDatasetSummary(spec.id, spec.query as never)
            : await queryDatasetRows(spec.id, spec.query as never);
      setResult({ columns: answer.columns, rows: answer.rows });
      setView((current) =>
        current.choice === 'none' ? guessView(answer.columns, answer.rows) : current,
      );
      if (answer.rows.length === 0) toast.info(t('dataExplorer.queryNoRows'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataExplorer.runFailed'));
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  const save = async () => {
    const spec = toQuery(form);
    if (!spec.ok || !result) {
      toast.error(t('dataExplorer.queryTryFirst'));
      return;
    }
    setSaving(true);
    try {
      const draft: ReportDraftInput = {
        sourceKind: spec.kind,
        datasetId: spec.kind === 'dataset' ? spec.id : null,
        semanticModelId: spec.kind === 'semantic_model' ? spec.id : null,
        query: spec.query,
        columns: result.columns,
        rows: result.rows,
        defaultTitle:
          spec.kind === 'dataset'
            ? (datasets.find((d) => d.id === spec.id)?.display_name ?? t('dataExplorer.report'))
            : `${models.find((m) => m.id === spec.id)?.name ?? ''} · ${metrics.find((m) => m.id === form.metric)?.name ?? ''}`,
      };
      const entry = buildReportEntry(draft, { title, insight, view });
      await updateDashboard(dashboardId, { reports: [...reports, entry] });
      toast.success(t('dataExplorer.reportAdded'));
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataExplorer.saveReportFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={openDialog}>
        <Plus size={16} aria-hidden />
        <span>{t('dataExplorer.addReport')}</span>
      </button>
      <Dialog
        open={open}
        onClose={() => !saving && !running && setOpen(false)}
        closeDisabled={saving || running}
        title={t('dataExplorer.addReport')}
        closeAriaLabel={t('shared.cancel')}
        size="md"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => !running && setOpen(false)}
              disabled={saving || running}
            >
              {t('shared.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void run()}
              disabled={running || saving}
            >
              {running ? (
                <Loader2 size={16} className="console-loading-spinner" aria-hidden />
              ) : (
                <Play size={16} aria-hidden />
              )}
              <span>{t('dataExplorer.queryTry')}</span>
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void save()}
              disabled={!result || saving || running}
            >
              {saving ? t('shared.saving') : t('dataExplorer.saveReport')}
            </button>
          </>
        }
      >
        <ReportQueryBuilder
          form={form}
          onChange={changeForm}
          datasets={datasets}
          models={models}
          metrics={metrics}
          fields={fields}
          datasetColumns={columns}
        />
        {result && (
          <>
            <p className="page-subtitle">
              {t('datasets.filterRows', { count: result.rows.length })}
            </p>
            <FormField label={t('dataExplorer.report')}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('dataExplorer.reportTitlePlaceholder')}
              />
            </FormField>
            <FormField label={t('dataExplorer.saveReportInsight')}>
              <input
                value={insight}
                onChange={(e) => setInsight(e.target.value)}
                placeholder={t('dataExplorer.saveReportInsightPlaceholder')}
              />
            </FormField>
            <ReportViewFields
              columns={result.columns}
              rows={result.rows}
              view={view}
              onChange={setView}
            />
          </>
        )}
      </Dialog>
    </>
  );
}
