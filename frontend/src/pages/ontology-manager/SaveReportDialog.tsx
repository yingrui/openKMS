import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  createDashboard,
  fetchDashboard,
  fetchDashboards,
  updateDashboard,
  type DashboardSummary,
} from '../../data/dashboardsApi';
import { Dialog, FormField } from '../../styles/design-system';
import { ReportViewFields } from './ReportViewFields';
import { buildReportEntry, guessView, type ReportDraftInput, type ViewDraft } from './reportDraft';

const NEW_DASHBOARD = '__new__';

/**
 * "Save this to a dashboard" — the round trip the design promised: a query built in the Playground
 * (a model metric) or the Data tab (a dataset slice) becomes a report in a dashboard, with the
 * source and query it came from. The chart is a default the person can change, previewed here with
 * the same component the dashboard uses.
 */
export function SaveReportDialog({ draft }: { draft: ReportDraftInput }) {
  const { t } = useTranslation('ontology');
  const [open, setOpen] = useState(false);
  const [dashboards, setDashboards] = useState<DashboardSummary[]>([]);
  const [target, setTarget] = useState(NEW_DASHBOARD);
  const [newName, setNewName] = useState('');
  const [title, setTitle] = useState('');
  const [insight, setInsight] = useState('');
  const [view, setView] = useState<ViewDraft>({
    choice: 'none',
    valueColumn: '',
    axisColumn: '',
    y: [],
  });
  const [saving, setSaving] = useState(false);

  const openDialog = useCallback(() => {
    setTitle(draft.defaultTitle);
    setInsight('');
    setView(guessView(draft.columns, draft.rows));
    setTarget(NEW_DASHBOARD);
    setNewName(draft.defaultTitle);
    setOpen(true);
    void fetchDashboards()
      .then((r) => {
        setDashboards(r.items);
        if (r.items.length > 0) setTarget(r.items[0].id);
      })
      .catch(() => undefined);
  }, [draft]);

  const save = async () => {
    setSaving(true);
    try {
      const entry = buildReportEntry(draft, { title, insight, view });
      const name = newName.trim() || title.trim() || draft.defaultTitle;
      if (target === NEW_DASHBOARD) {
        await createDashboard({ name, reports: [entry] });
      } else {
        // Append by sending the array back — the document is the dashboard, and its reports are ours.
        const dashboard = await fetchDashboard(target);
        await updateDashboard(target, { reports: [...(dashboard.reports ?? []), entry] });
      }
      toast.success(t('dataInsights.saveReportSaved'));
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataInsights.saveReportFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={openDialog}>
        <Save size={14} aria-hidden />
        <span>{t('dataInsights.saveToDashboard')}</span>
      </button>
      <Dialog
        open={open}
        onClose={() => !saving && setOpen(false)}
        closeDisabled={saving}
        title={t('dataInsights.saveToDashboard')}
        closeAriaLabel={t('shared.cancel')}
        size="md"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => !saving && setOpen(false)}
              disabled={saving}
            >
              {t('shared.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void save()}
              disabled={saving || (target === NEW_DASHBOARD && !newName.trim())}
            >
              {saving ? t('shared.saving') : t('dataInsights.saveReport')}
            </button>
          </>
        }
      >
        <FormField label={t('dataInsights.saveReportDashboard')}>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value={NEW_DASHBOARD}>{t('dataInsights.newDashboard')}</option>
            {dashboards.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </FormField>
        {target === NEW_DASHBOARD && (
          <FormField label={t('dataInsights.dashboardName')}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </FormField>
        )}
        <FormField label={t('dataInsights.report')}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <FormField label={t('dataInsights.saveReportInsight')}>
          <input
            value={insight}
            onChange={(e) => setInsight(e.target.value)}
            placeholder={t('dataInsights.saveReportInsightPlaceholder')}
          />
        </FormField>
        <ReportViewFields columns={draft.columns} rows={draft.rows} view={view} onChange={setView} />
      </Dialog>
    </>
  );
}
