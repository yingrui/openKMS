import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loader2, Play, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteExplorerReport,
  fetchExplorerReport,
  runExplorerReport,
  type ExplorerReport,
  type ExplorerReportBlock,
} from '../../data/explorerApi';
import { fetchDatasets, type DatasetResponse } from '../../data/datasetsApi';
import { fetchSemanticModels, type SemanticModelResponse } from '../../data/semanticModelsApi';
import { useConfirm } from '../../contexts/ConfirmContext';
import '../ontology/ontology-admin.scss';
import './data-explorer.scss';

export function ExplorerReportDetail() {
  const { t } = useTranslation('ontology');
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [report, setReport] = useState<ExplorerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [models, setModels] = useState<SemanticModelResponse[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setReport(await fetchExplorerReport(id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('datasets.loadFailed'));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // The source's name is part of the report's provenance: every number says where it came from.
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
      setReport(await runExplorerReport(id));
      toast.success(t('dataExplorer.ran'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataExplorer.runFailed'));
    } finally {
      setRunning(false);
    }
  };

  const sourceLabel = () => {
    if (!report) return '';
    if (report.source_kind === 'semantic_model') {
      const m = models.find((x) => x.id === report.semantic_model_id);
      return m ? m.name : t('dataExplorer.sourceMissing');
    }
    const d = datasets.find((x) => x.id === report.dataset_id);
    return d ? d.display_name || `${d.schema_name}.${d.table_name}` : t('dataExplorer.sourceMissing');
  };

  const sourceHref = () => {
    if (!report) return null;
    if (report.source_kind === 'semantic_model') {
      return report.semantic_model_id ? `/data-model/${report.semantic_model_id}` : null;
    }
    return report.dataset_id ? `/datasets/${report.dataset_id}` : null;
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
      await deleteExplorerReport(id);
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
  if (!report) return null;

  return (
    <div className="ontology-admin">
      <div className="page-header">
        <div>
          <h1>{report.name}</h1>
          {report.question && <p className="page-subtitle">{report.question}</p>}
        </div>
        <div className="page-header-actions">
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
            <span>{t('dataExplorer.run')}</span>
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void handleDelete()}>
            <Trash2 size={16} aria-hidden />
            <span>{t('shared.delete')}</span>
          </button>
        </div>
      </div>
      <p className="page-subtitle explorer-report-source">
        {report.source_kind === 'semantic_model'
          ? t('dataExplorer.sourceModel')
          : t('dataExplorer.sourceDataset')}{' '}
        {sourceHref() ? <Link to={sourceHref()!}>{sourceLabel()}</Link> : sourceLabel()}
      </p>
      <div className="ontology-admin-content">
        {report.narrative ? (
          <section>
            <h2>{t('dataExplorer.narrative')}</h2>
            <div className="explorer-report-narrative">{report.narrative}</div>
          </section>
        ) : (
          <p className="entity-view__readonly">{t('dataExplorer.noNarrative')}</p>
        )}
        {(report.blocks ?? []).map((block: ExplorerReportBlock, i: number) => (
          <section key={i} className="explorer-report-chart">
            <h3>{block.title ?? t('dataExplorer.block')}</h3>
            {block.insight && <p className="explorer-report-chart__insight">{block.insight}</p>}
            {block.error ? (
              <div className="playground__error playground__error--request" role="alert">
                <p className="playground__error-title">
                  {block.error.message ?? t('dataExplorer.blockFailed')}
                </p>
                {block.error.detail && (
                  <details className="playground__error-details">
                    <summary>{t('dataModel.playgroundErrorDetails')}</summary>
                    <pre>{block.error.detail}</pre>
                  </details>
                )}
              </div>
            ) : !block.ran_at ? (
              <p className="entity-view__readonly">{t('dataExplorer.blockNotRun')}</p>
            ) : (block.rows?.length ?? 0) === 0 ? (
              <p className="entity-view__readonly">{t('dataExplorer.blockNoRows')}</p>
            ) : (
              <>
                <p className="page-subtitle">
                  {t('datasets.filterRows', { count: block.rows?.length ?? 0 })}
                  {block.capped ? ` · ${t('datasets.filterCapped')}` : ''}
                  {block.duration_ms != null ? ` · ${block.duration_ms} ms` : ''}
                </p>
                <div className="ds-table-wrap">
                  <table className="console-table">
                    <thead>
                      <tr>
                        {(block.columns ?? Object.keys(block.rows![0])).map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(block.rows ?? []).map((row, ri) => (
                        <tr key={ri}>
                          {(block.columns ?? Object.keys(block.rows![0])).map((c) => (
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
              </>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
