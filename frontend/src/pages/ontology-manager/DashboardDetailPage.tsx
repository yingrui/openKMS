import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Pencil,
  Play,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteDashboard,
  fetchDashboard,
  runDashboard,
  updateDashboard,
  type DashboardReport,
  type Dashboard,
} from '../../data/dashboardsApi';
import { fetchDatasets, type DatasetResponse } from '../../data/datasetsApi';
import { fetchSemanticModels, type SemanticModelResponse } from '../../data/semanticModelsApi';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { RichMarkdown } from '../../components/markdown/richMarkdown';
import { StatusChip } from '../../styles/design-system';
import { DashboardReportView } from './DashboardReportView';
import { EntityViewHeader, EntityViewLoading, EntityViewPanel, EntityViewShell } from './EntityViewShell';
import { AddReportDialog } from './AddReportDialog';
import { reportSource } from './reportSource';
import './data-insights.scss';
import { EditReportDialog } from './EditReportDialog';
import { applyReportFields, moveReport, removeReport, replaceReport } from './dashboardEdits';
import './data-insights.scss';

export function DashboardDetailPage() {
  const { t } = useTranslation('ontology');
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('insights:write');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [narrativeDraft, setNarrativeDraft] = useState<string | null>(null);
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

  const reports = dashboard?.reports ?? [];

  /** The document **is** the dashboard, so every edit writes the array (or the narrative) back. */
  const saveDocument = async (
    body: { reports?: DashboardReport[]; narrative?: string | null },
    message: string,
  ) => {
    setSaving(true);
    try {
      setDashboard(await updateDashboard(id, body));
      toast.success(message);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataInsights.saveReportFailed'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async () => {
    setRunning(true);
    try {
      setDashboard(await runDashboard(id));
      toast.success(t('dataInsights.ran'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataInsights.runFailed'));
    } finally {
      setRunning(false);
    }
  };

  const handleRemoveReport = async (index: number) => {
    if (
      !(await confirm({
        title: t('shared.delete'),
        message: t('dataInsights.removeReportConfirm'),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    await saveDocument({ reports: removeReport(reports, index) }, t('dataInsights.reportRemoved'));
  };

  const handleDelete = async () => {
    if (
      !(await confirm({
        title: t('shared.delete'),
        message: t('dataInsights.deleteConfirm'),
        confirmLabel: t('shared.delete'),
        danger: true,
      }))
    )
      return;
    try {
      await deleteDashboard(id);
      toast.success(t('dataInsights.deleted'));
      navigate('/data-insights');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataInsights.deleteFailed'));
    }
  };

  if (loading) return <EntityViewLoading label={t('shared.loading')} />;
  if (!dashboard) return null;

  const editingReport = editing === null ? null : reports[editing];

  return (
    <>
    <EntityViewShell
      backTo="/data-insights"
      backLabel={t('dataInsights.backToDashboards')}
      title={dashboard.name}
      /* The rail is this app's table of contents; a dashboard's sections are its reports, so it
         lists them (the answer first), with where each one's numbers come from underneath. */
      navItems={[
        { sectionId: 'narrative', label: t('dataInsights.narrative') },
        ...reports.map((report, i) => ({
          sectionId: `report-${i}`,
          label: report.title ?? t('dataInsights.report'),
          hint: reportSource(report, datasets, models, t('dataInsights.sourceMissing')).label,
        })),
      ]}
      meta={dashboard.question ?? t('dataInsights.noQuestion')}
      identityAction={
        /* One line for what this document *is* and the action that ends it: the state, how much is
           in it, and the delete — a quiet text link (the slot's styling), never beside Run. */
        <>
          <StatusChip tone={dashboard.status === 'ready' ? 'ok' : 'neutral'}>
            {t(`dataInsights.status_${dashboard.status}`, { defaultValue: dashboard.status })}
          </StatusChip>
          <span className="entity-view__identity-note">
            {t('dataInsights.reportCount', { count: reports.length })}
          </span>
          {/* An icon with the platform's own tooltip. The label used to *expand* on hover, which
              re-wrapped the rail's row, moved the button out from under the cursor, and flickered. */}
          <button
            type="button"
            className="is-danger"
            onClick={() => void handleDelete()}
            aria-label={t('dataInsights.deleteDashboard')}
            title={t('dataInsights.deleteDashboard')}
          >
            <Trash2 size={14} aria-hidden />
          </button>
        </>
      }
    >
      {/* What the document *does* — the primary action, where a page's actions belong. */}
      <EntityViewHeader
        title=""
        actions={
          <>
            {/* Write into this document without leaving it: build a query, try it, save the report. */}
            <AddReportDialog dashboardId={id} reports={reports} onSaved={() => void load()} />
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
              <span>{t('dataInsights.run')}</span>
            </button>
          </>
        }
      />
      <EntityViewPanel
        id="narrative"
        title={t('dataInsights.narrative')}
        actions={
          narrativeDraft === null && canWrite && dashboard.narrative ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setNarrativeDraft(dashboard.narrative ?? '')}
              title={t('shared.edit')}
            >
              <Pencil size={14} aria-hidden />
            </button>
          ) : null
        }
      >
        {narrativeDraft === null ? (
          dashboard.narrative ? (
            <RichMarkdown className="dashboard-narrative">{dashboard.narrative}</RichMarkdown>
          ) : (
            <p className="entity-view__readonly">{t('dataInsights.noNarrative')}</p>
          )
        ) : (
          <>
            <textarea
              className="dashboard-narrative__editor"
              value={narrativeDraft}
              onChange={(e) => setNarrativeDraft(e.target.value)}
              rows={8}
              aria-label={t('dataInsights.narrative')}
            />
            <div className="openkms-flex-row-gap openkms-mt-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() =>
                  void saveDocument(
                    { narrative: narrativeDraft },
                    t('dataInsights.narrativeSaved'),
                  ).then((ok) => ok && setNarrativeDraft(null))
                }
                disabled={saving}
              >
                {saving ? t('shared.saving') : t('shared.save')}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setNarrativeDraft(null)}
                disabled={saving}
              >
                {t('shared.cancel')}
              </button>
            </div>
          </>
        )}
      </EntityViewPanel>
      {reports.length === 0 && (
        <p className="entity-view__readonly">{t('dataInsights.reportsEmpty')}</p>
      )}
        {reports.map((report, i) => (
          <DashboardReportView
            key={i}
            id={`report-${i}`}
            report={report}
            datasets={datasets}
            models={models}
            actions={
              canWrite ? (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setEditing(i)}
                    title={t('dataInsights.editReport')}
                  >
                    <Pencil size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      void saveDocument(
                        { reports: moveReport(reports, i, -1) },
                        t('dataInsights.reportsReordered'),
                      )
                    }
                    disabled={i === 0 || saving}
                    title={t('dataInsights.moveUp')}
                  >
                    <ArrowUp size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      void saveDocument(
                        { reports: moveReport(reports, i, 1) },
                        t('dataInsights.reportsReordered'),
                      )
                    }
                    disabled={i === reports.length - 1 || saving}
                    title={t('dataInsights.moveDown')}
                  >
                    <ArrowDown size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => void handleRemoveReport(i)}
                    disabled={saving}
                    title={t('dataInsights.removeReport')}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </>
              ) : null
            }
          />
        ))}
      {editingReport && (
        <EditReportDialog
          key={editing}
          report={editingReport}
          columns={editingReport.columns ?? []}
          rows={editingReport.rows ?? []}
          onClose={() => setEditing(null)}
          onSave={(fields) => {
            void saveDocument(
              { reports: replaceReport(reports, editing ?? 0, applyReportFields(editingReport, fields)) },
              t('dataInsights.reportUpdated'),
            ).then((ok) => ok && setEditing(null));
          }}
        />
      )}
    </EntityViewShell>
    </>
  );
}
