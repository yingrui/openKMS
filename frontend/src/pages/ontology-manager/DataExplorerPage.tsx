import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDatasets, type DatasetResponse } from '../../data/datasetsApi';
import { fetchSemanticModels, type SemanticModelResponse } from '../../data/semanticModelsApi';
import {
  createDashboard,
  fetchDashboards,
  type DashboardReport,
  type ExplorerDashboard,
} from '../../data/dashboardsApi';
import { Dialog, EmptyState, FormField } from '../../styles/design-system';
import '../ontology/ontology-admin.scss';
import './data-explorer.scss';

/** The source names a dashboard's reports read — a dashboard may mix several. */
function sourceNames(
  reports: DashboardReport[] | null,
  datasets: DatasetResponse[],
  models: SemanticModelResponse[],
): string[] {
  const names = new Set<string>();
  for (const report of reports ?? []) {
    if (report.source_kind === 'semantic_model') {
      const model = models.find((m) => m.id === report.semantic_model_id);
      names.add(model ? model.name : '');
    } else {
      const dataset = datasets.find((d) => d.id === report.dataset_id);
      names.add(dataset ? dataset.display_name || `${dataset.schema_name}.${dataset.table_name}` : '');
    }
  }
  return [...names];
}

export function DataExplorerPage() {
  const { t } = useTranslation('ontology');
  const navigate = useNavigate();
  const [dashboards, setDashboards] = useState<ExplorerDashboard[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [models, setModels] = useState<SemanticModelResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [question, setQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, ds, ms] = await Promise.all([
        fetchDashboards(),
        fetchDatasets(),
        fetchSemanticModels(),
      ]);
      setDashboards(d.items);
      setDatasets(ds.items);
      setModels(ms.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setName('');
    setQuestion('');
    setShowForm(true);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error(t('dataExplorer.nameRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const created = await createDashboard({
        name: name.trim(),
        question: question.trim() || null,
      });
      toast.success(t('dataExplorer.created'));
      setShowForm(false);
      navigate(`/data-explorer/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataExplorer.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ontology-admin">
      <div className="page-header">
        <div>
          <h1>{t('dataExplorer.title')}</h1>
          <p className="page-subtitle">{t('dataExplorer.subtitle')}</p>
        </div>
        <div className="page-header-actions">
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus size={18} aria-hidden />
            <span>{t('dataExplorer.newDashboard')}</span>
          </button>
        </div>
      </div>
      <div className="ontology-admin-content">
        {loading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" aria-hidden />
            <p>{t('shared.loading')}</p>
          </div>
        ) : dashboards.length === 0 ? (
          <EmptyState title={t('dataExplorer.empty')} description={t('dataExplorer.subtitle')} />
        ) : (
          <div className="explorer-reports">
            {dashboards.map((d) => {
              const names = sourceNames(d.reports, datasets, models);
              return (
                <Link key={d.id} to={`/data-explorer/${d.id}`} className="explorer-report-card">
                  <span className="explorer-report-card__icon" aria-hidden>
                    <Sparkles size={18} />
                  </span>
                  <span className="explorer-report-card__body">
                    <strong>{d.name}</strong>
                    {d.question && <span className="explorer-report-card__q">{d.question}</span>}
                    <span className="explorer-report-card__meta">
                      {t('dataExplorer.reportCount', { count: d.reports?.length ?? 0 })}
                      {names.length > 0 && (
                        <>
                          {' · '}
                          {names.filter(Boolean).join(' + ') || t('dataExplorer.sourceMissing')}
                        </>
                      )}
                      {' · '}
                      {d.status}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={showForm}
        onClose={() => !submitting && setShowForm(false)}
        closeDisabled={submitting}
        title={t('dataExplorer.newDashboard')}
        closeAriaLabel={t('shared.cancel')}
        size="sm"
        footer={
          <>
            <button
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
              onClick={() => void handleCreate()}
              disabled={!name.trim() || submitting}
            >
              {submitting ? t('shared.saving') : t('shared.create')}
            </button>
          </>
        }
      >
        <FormField label={t('dataExplorer.dashboardName')}>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label={t('dataExplorer.question')}>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t('dataExplorer.questionPlaceholder')}
          />
        </FormField>
      </Dialog>
    </div>
  );
}
