import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteExplorerReport,
  fetchExplorerReport,
  type ExplorerReport,
} from '../../data/explorerApi';
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
          <button type="button" className="btn btn-secondary" onClick={() => void handleDelete()}>
            <Trash2 size={16} aria-hidden />
            <span>{t('shared.delete')}</span>
          </button>
        </div>
      </div>
      <div className="ontology-admin-content">
        {report.narrative ? (
          <section>
            <h2>{t('dataExplorer.narrative')}</h2>
            <div className="explorer-report-narrative">{report.narrative}</div>
          </section>
        ) : (
          <p className="entity-view__readonly">{t('dataExplorer.noNarrative')}</p>
        )}
        {(report.charts ?? []).map((chart, i) => (
          <section key={i} className="explorer-report-chart">
            <h3>{chart.title ?? t('dataExplorer.chart')}</h3>
            {chart.insight && <p className="explorer-report-chart__insight">{chart.insight}</p>}
            {chart.rows && chart.rows.length > 0 && (
              <div className="ds-table-wrap">
                <table className="console-table">
                  <thead>
                    <tr>
                      {(chart.columns ?? Object.keys(chart.rows[0])).map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chart.rows.map((row, ri) => (
                      <tr key={ri}>
                        {(chart.columns ?? Object.keys(chart.rows![0])).map((c) => (
                          <td key={c}>
                            {row[c] === null || row[c] === undefined ? t('datasets.dash') : String(row[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
