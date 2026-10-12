import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDatasets, type DatasetResponse } from '../../data/datasetsApi';
import {
  createExplorerReport,
  fetchExplorerReports,
  type ExplorerReport,
} from '../../data/explorerApi';
import { Dialog, EmptyState, FormField } from '../../styles/design-system';
import '../ontology/ontology-admin.scss';
import './data-explorer.scss';

export function DataExplorerPage() {
  const { t } = useTranslation('ontology');
  const navigate = useNavigate();
  const [reports, setReports] = useState<ExplorerReport[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [question, setQuestion] = useState('');
  const [datasetId, setDatasetId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, ds] = await Promise.all([fetchExplorerReports(), fetchDatasets()]);
      setReports(r.items);
      setDatasets(ds.items);
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
    setDatasetId('');
    setShowForm(true);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error(t('dataExplorer.nameRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const created = await createExplorerReport({
        name: name.trim(),
        question: question.trim() || null,
        dataset_id: datasetId || null,
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

  const datasetName = (id: string | null) => {
    const d = datasets.find((x) => x.id === id);
    return d ? d.display_name || `${d.schema_name}.${d.table_name}` : null;
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
            <span>{t('dataExplorer.newReport')}</span>
          </button>
        </div>
      </div>
      <div className="ontology-admin-content">
        {loading ? (
          <div className="console-loading">
            <Loader2 size={32} className="console-loading-spinner" aria-hidden />
            <p>{t('shared.loading')}</p>
          </div>
        ) : reports.length === 0 ? (
          <EmptyState title={t('dataExplorer.empty')} description={t('dataExplorer.subtitle')} />
        ) : (
          <div className="explorer-reports">
            {reports.map((r) => (
              <Link key={r.id} to={`/data-explorer/${r.id}`} className="explorer-report-card">
                <span className="explorer-report-card__icon" aria-hidden>
                  <Sparkles size={18} />
                </span>
                <span className="explorer-report-card__body">
                  <strong>{r.name}</strong>
                  {r.question && <span className="explorer-report-card__q">{r.question}</span>}
                  <span className="explorer-report-card__meta">
                    {datasetName(r.dataset_id) ?? t('dataExplorer.noDataset')} · {r.status}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={showForm}
        onClose={() => !submitting && setShowForm(false)}
        closeDisabled={submitting}
        title={t('dataExplorer.newReport')}
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
              {submitting ? t('shared.saving') : t('joinCreate')}
            </button>
          </>
        }
      >
        <FormField label={t('dataExplorer.reportName')}>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label={t('dataExplorer.question')}>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t('dataExplorer.questionPlaceholder')}
          />
        </FormField>
        <FormField label={t('datasets.fieldDataSource')}>
          <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
            <option value="">{t('dataExplorer.noDataset')}</option>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.display_name || `${d.schema_name}.${d.table_name}`}
              </option>
            ))}
          </select>
        </FormField>
      </Dialog>
    </div>
  );
}
