import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  createDashboard,
  fetchDashboard,
  fetchDashboards,
  updateDashboard,
  type ExplorerDashboard,
} from '../../data/dashboardsApi';
import { CheckList, CheckListItem, Dialog, FormField } from '../../styles/design-system';
import { ExplorerChart } from './ExplorerChart';
import { chartFits, chartSeries } from './explorerChartSpec';
import {
  buildReportEntry,
  chartSpec,
  guessChart,
  type ChartChoice,
  type ChartDraft,
  type ReportDraftInput,
} from './reportDraft';

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
  const [dashboards, setDashboards] = useState<ExplorerDashboard[]>([]);
  const [target, setTarget] = useState(NEW_DASHBOARD);
  const [newName, setNewName] = useState('');
  const [title, setTitle] = useState('');
  const [insight, setInsight] = useState('');
  const [chart, setChart] = useState<ChartDraft>({ choice: 'none', x: '', y: [] });
  const [saving, setSaving] = useState(false);

  const openDialog = useCallback(() => {
    setTitle(draft.defaultTitle);
    setInsight('');
    setChart(guessChart(draft.columns, draft.rows));
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

  const spec = useMemo(() => chartSpec(chart), [chart]);
  const series = useMemo(
    () => (chartFits(spec, draft.columns) && spec ? chartSeries(draft.rows, spec) : null),
    [spec, draft.columns, draft.rows],
  );

  const save = async () => {
    setSaving(true);
    try {
      const entry = buildReportEntry(draft, { title, insight, chart });
      const name = newName.trim() || title.trim() || draft.defaultTitle;
      if (target === NEW_DASHBOARD) {
        await createDashboard({ name, reports: [entry] });
      } else {
        // Append by sending the array back — the document is the dashboard, and its reports are ours.
        const dashboard = await fetchDashboard(target);
        await updateDashboard(target, { reports: [...(dashboard.reports ?? []), entry] });
      }
      toast.success(t('dataExplorer.saveReportSaved'));
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dataExplorer.saveReportFailed'));
    } finally {
      setSaving(false);
    }
  };

  const toggleY = (column: string) => {
    setChart((prev) => ({
      ...prev,
      y: prev.y.includes(column) ? prev.y.filter((c) => c !== column) : [...prev.y, column],
    }));
  };

  /** Choosing a chart picks a measure to draw, so the choice is never "a chart of nothing". */
  const chooseChart = (choice: ChartChoice) => {
    setChart((prev) => {
      if (choice === 'none') return { ...prev, choice };
      const y = prev.y.length > 0 ? prev.y : draft.columns.filter((c) => c !== prev.x).slice(0, 1);
      const x = prev.x || draft.columns[0] || '';
      return { choice, x, y: y.filter((c) => c !== x) };
    });
  };

  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={openDialog}>
        <Save size={14} aria-hidden />
        <span>{t('dataExplorer.saveToDashboard')}</span>
      </button>
      <Dialog
        open={open}
        onClose={() => !saving && setOpen(false)}
        closeDisabled={saving}
        title={t('dataExplorer.saveToDashboard')}
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
              {saving ? t('shared.saving') : t('dataExplorer.saveReport')}
            </button>
          </>
        }
      >
        <FormField label={t('dataExplorer.saveReportDashboard')}>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value={NEW_DASHBOARD}>{t('dataExplorer.newDashboard')}</option>
            {dashboards.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </FormField>
        {target === NEW_DASHBOARD && (
          <FormField label={t('dataExplorer.dashboardName')}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </FormField>
        )}
        <FormField label={t('dataExplorer.report')}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <FormField label={t('dataExplorer.saveReportInsight')}>
          <input
            value={insight}
            onChange={(e) => setInsight(e.target.value)}
            placeholder={t('dataExplorer.saveReportInsightPlaceholder')}
          />
        </FormField>
        <FormField label={t('dataExplorer.saveReportChart')}>
          <select
            value={chart.choice}
            onChange={(e) => chooseChart(e.target.value as ChartChoice)}
          >
            <option value="none">{t('dataExplorer.viewTable')}</option>
            <option value="line">{t('dataExplorer.chartLine')}</option>
            <option value="bar">{t('dataExplorer.chartBar')}</option>
          </select>
        </FormField>
        {chart.choice !== 'none' && (
          <>
            <FormField label={t('dataExplorer.chartX')}>
              <select value={chart.x} onChange={(e) => setChart((p) => ({ ...p, x: e.target.value }))}>
                {draft.columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label={t('dataExplorer.chartY')}>
              <CheckList>
                {draft.columns
                  .filter((c) => c !== chart.x)
                  .map((c) => (
                    <CheckListItem
                      key={c}
                      checked={chart.y.includes(c)}
                      onChange={() => toggleY(c)}
                    >
                      {c}
                    </CheckListItem>
                  ))}
              </CheckList>
            </FormField>
            {spec && series ? (
              <ExplorerChart spec={spec} series={series} />
            ) : (
              <p className="entity-view__readonly">{t('dataExplorer.saveReportNoChart')}</p>
            )}
          </>
        )}
      </Dialog>
    </>
  );
}
