import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loader2, Play, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteDashboard,
  fetchDashboard,
  runDashboard,
  type ExplorerDashboard,
} from '../../data/dashboardsApi';
import { fetchDatasets, type DatasetResponse } from '../../data/datasetsApi';
import { fetchSemanticModels, type SemanticModelResponse } from '../../data/semanticModelsApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import { DashboardReportView } from './DashboardReportView';
import '../ontology/ontology-admin.scss';
import './data-explorer.scss';

export function DashboardDetailPage() {
  const { t } = useTranslation('ontology');
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [dashboard, setDashboard] = useState<ExplorerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [models, setModels] = useState<SemanticModelResponse[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setDashboard(await fetchDashboard(id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // A source's name is part of a report's provenance: every number says where it came from.
  useEffect(() => {
    void Promise.all([fetchDatasets(), fetchSemanticModels()])
      .then(([d, m]) => {
        setDatasets(d.items);
        setModels(m.items);
      })
      .catch(() => undefined);
  }, []);

  const handleRun = async () => {
    setRunning(true);
    try {
      setDashboard(await runDashboard(id));
      toast.success(t('dataExplorer.ran'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataExplorer.runFailed'));
    } finally {
      setRunning(false);
    }
  };

  const handleDelete = async () => {
    if (
      !(await confirm({
        title: t('shared.delete'),
        message: t('dataExplorer.deleteConfirm'),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    try {
      await deleteDashboard(id);
      toast.success(t('dataExplorer.deleted'));
      navigate('/data-explorer');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataExplorer.deleteFailed'));
    }
  };

  if (loading) {
    return (
      <div className="console-loading">
        <Loader2 size={32} className="console-loading-spinner" aria-hidden />
        <p>{t('shared.loading')}</p>
      </div>
    );
  }
  if (!dashboard) return null;

  const reports = dashboard.reports ?? [];

  return (
    <div className="ontology-admin">
      <div className="page-header">
        <div>
          <h1>{dashboard.name}</h1>
          <p className="page-subtitle">
            {dashboard.question ?? t('dataExplorer.noQuestion')}
            {' · '}
            <Link to="/data-explorer">{t('dataExplorer.backToDashboards')}</Link>
          </p>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleRun()}
            disabled={running || reports.length === 0}
          >
            {running ? (
              <Loader2 size={16} className="console-loading-spinner" aria-hidden />
            ) : (
              <Play size={16} aria-hidden />
            )}
            <span>{t('dataExplorer.run')}</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void handleDelete()}
            aria-label={t('shared.delete')}
          >
            <Trash2 size={16} aria-hidden />
          </button>
        </div>
      </div>
      <div className="ontology-admin-content">
        {dashboard.narrative ? (
          <section>
            <h2>{t('dataExplorer.narrative')}</h2>
            <div className="explorer-report-narrative">{dashboard.narrative}</div>
          </section>
        ) : (
          <p className="entity-view__readonly">{t('dataExplorer.noNarrative')}</p>
        )}
        {reports.length === 0 && (
          <p className="entity-view__readonly">{t('dataExplorer.reportsEmpty')}</p>
        )}
        {reports.map((report, i) => (
          <DashboardReportView key={i} report={report} datasets={datasets} models={models} />
        ))}
      </div>
    </div>
  );
}
