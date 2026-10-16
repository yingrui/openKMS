import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DashboardReport } from '../../data/dashboardsApi';
import { Dialog, FormField } from '../../styles/design-system';
import { ReportChartFields } from './ReportChartFields';
import { chartDraftFromSpec } from './reportDraft';
import type { ReportFields } from './dashboardEdits';

/**
 * Edit one report: what it says and how it is drawn.
 *
 * The **query is not editable here** on purpose — it belongs where it was built (the Playground for
 * a model metric, the Data tab for a dataset slice); "save to a dashboard" writes a new report for a
 * new query. Editing keeps the report's source, query and last run untouched.
 */
export function EditReportDialog({
  report,
  columns,
  rows,
  onSave,
  onClose,
}: {
  report: DashboardReport;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  onSave: (fields: ReportFields) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('ontology');
  const [title, setTitle] = useState(report.title ?? '');
  const [insight, setInsight] = useState(report.insight ?? '');
  /** Parsed once per report — this dialog is keyed by the report it edits. */
  const [chart, setChart] = useState(() => chartDraftFromSpec(report.chart, columns));
  const canSave = useMemo(() => title.trim() !== '' || (report.title ?? '') !== '', [title, report.title]);

  return (
    <Dialog
      open
      onClose={onClose}
      closeAriaLabel={t('shared.cancel')}
      title={t('dataExplorer.editReport')}
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('shared.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onSave({ title, insight, chart })}
            disabled={!canSave}
          >
            {t('shared.save')}
          </button>
        </>
      }
    >
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
      <ReportChartFields columns={columns} rows={rows} chart={chart} onChange={setChart} />
    </Dialog>
  );
}
