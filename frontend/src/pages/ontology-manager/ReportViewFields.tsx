import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckList, CheckListItem, FormField } from '../../styles/design-system';
import { ExplorerChart } from './ExplorerChart';
import { chartFits, chartSeries, viewFits } from './reportView';
import { viewSpec, type ViewChoice, type ViewDraft } from './reportDraft';
import { ReportBarList } from './ReportBarList';
import { ReportMetric } from './ReportMetric';

/**
 * How a report is presented: the table, a trend, a number or a ranking — over the columns of its
 * result, previewed by the same components the dashboard draws with.
 *
 * Shared by "save this query" and "edit this report", because the question is identical in both.
 */
export function ReportViewFields({
  columns,
  rows,
  view,
  onChange,
}: {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  view: ViewDraft;
  onChange: (next: ViewDraft) => void;
}) {
  const { t } = useTranslation('ontology');
  const spec = useMemo(() => viewSpec(view), [view]);
  const series = useMemo(
    () => (spec?.kind === 'chart' && chartFits(spec, columns) ? chartSeries(rows, spec) : null),
    [spec, columns, rows],
  );

  /** Choosing a presentation picks a column to draw, so the choice is never "a chart of nothing". */
  const choose = (choice: ViewChoice) => {
    if (choice === 'none') {
      onChange({ ...view, choice });
      return;
    }
    const x = view.x || columns[0] || '';
    // A metric or a ranking draws one column; a chart needs a measure that is not its axis.
    const y =
      choice === 'metric' || choice === 'bar_list'
        ? []
        : (view.y.length > 0 ? view.y : columns.slice(0, 1)).filter((c) => c !== x);
    onChange({ choice, x, y });
  };

  const toggleY = (column: string) => {
    onChange({
      ...view,
      y: view.y.includes(column) ? view.y.filter((c) => c !== column) : [...view.y, column],
    });
  };

  const singleColumn = view.choice === 'metric' || view.choice === 'bar_list';

  return (
    <>
      <FormField label={t('dataExplorer.viewKind')}>
        <select value={view.choice} onChange={(e) => choose(e.target.value as ViewChoice)}>
          <option value="none">{t('dataExplorer.viewTable')}</option>
          <option value="line">{t('dataExplorer.chartLine')}</option>
          <option value="bar">{t('dataExplorer.chartBar')}</option>
          <option value="metric">{t('dataExplorer.viewMetric')}</option>
          <option value="bar_list">{t('dataExplorer.viewBarList')}</option>
        </select>
      </FormField>
      {view.choice !== 'none' && (
        <>
          <FormField
            label={singleColumn ? t('dataExplorer.viewValueColumn') : t('dataExplorer.chartX')}
          >
            <select value={view.x} onChange={(e) => onChange({ ...view, x: e.target.value })}>
              {columns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FormField>
          {!singleColumn && (
            <FormField label={t('dataExplorer.chartY')}>
              <CheckList>
                {columns
                  .filter((c) => c !== view.x)
                  .map((c) => (
                    <CheckListItem key={c} checked={view.y.includes(c)} onChange={() => toggleY(c)}>
                      {c}
                    </CheckListItem>
                  ))}
              </CheckList>
            </FormField>
          )}
          {spec && viewFits(spec, columns) ? (
            spec.kind === 'metric' ? (
              <ReportMetric view={spec} rows={rows} />
            ) : spec.kind === 'bar_list' ? (
              <ReportBarList view={spec} rows={rows} />
            ) : series ? (
              <ExplorerChart spec={spec} series={series} />
            ) : null
          ) : (
            <p className="entity-view__readonly">{t('dataExplorer.saveReportNoChart')}</p>
          )}
        </>
      )}
    </>
  );
}
